import { connectSignaling } from './signaling';

export type Role = 'sender' | 'viewer';
export type Facing = 'environment' | 'user';

function getUserMediaFn(): (c: MediaStreamConstraints) => Promise<MediaStream> {
  const md = navigator.mediaDevices as any;
  if (md && typeof md.getUserMedia === 'function') {
    return (c: MediaStreamConstraints) => md.getUserMedia.call(md, c);
  }
  const legacy = (navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia || (navigator as any).msGetUserMedia;
  if (legacy) {
    return (c: MediaStreamConstraints) => new Promise<MediaStream>((resolve, reject) => legacy.call(navigator, c, resolve, reject));
  }
  return (_c: MediaStreamConstraints) => Promise.reject(new Error('getUserMedia not supported'));
}

export async function setupPeer(
  room: string,
  role: Role,
  videoEl: HTMLVideoElement,
  facing: Facing = 'environment',
  deviceId?: string,
): Promise<{pc: RTCPeerConnection, data?: RTCDataChannel, ws: WebSocket}> {
  const ws = connectSignaling(room);
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  });
  
  console.log('Setting up peer for role:', role);
  
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('Sending ICE candidate');
      ws.send(JSON.stringify({ type: 'candidate', candidate: e.candidate }));
    }
  };

  if (role === 'viewer') {
    pc.ontrack = (ev) => {
      console.log('Received track:', ev.track.kind);
      const [stream] = ev.streams;
      console.log('Setting video srcObject');
      videoEl.srcObject = stream;
      videoEl.play().catch((e) => {
        console.error('Error playing video:', e);
      });
    };
  }

  let data: RTCDataChannel | undefined;
  if (role === 'sender') {
    data = pc.createDataChannel('meta');
  } else {
    pc.ondatachannel = (ev) => { data = ev.channel; };
  }

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data);
    console.log('Received message:', msg.type);
    
    if (msg.type === 'offer' && role === 'viewer') {
      console.log('Processing offer as viewer');
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
    } else if (msg.type === 'answer' && role === 'sender') {
      console.log('Processing answer as sender');
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    } else if (msg.type === 'candidate') {
      console.log('Adding ICE candidate');
      try { 
        await pc.addIceCandidate(msg.candidate); 
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    }
  };

  if (role === 'sender') {
    console.log('Getting user media for sender');
    try {
      const getUserMedia = getUserMediaFn();
      
      // Prefer back camera on mobile; provide multiple fallbacks to improve chances
      const constraintsList: MediaStreamConstraints[] = [
        ...(deviceId ? [{ video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false } as MediaStreamConstraints] : []),
        { video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false },
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false },
        { video: true, audio: false },
      ];
      let stream: MediaStream | null = null;
      let lastError: any = null;
      for (const c of constraintsList) {
        try {
          // @ts-ignore legacy signatures handled above
          stream = await getUserMedia(c);
          if (stream) break;
        } catch (e) { lastError = e; }
      }
      if (!stream) { throw lastError || new Error('Unable to access camera'); }
      console.log('Got media stream, tracks:', stream.getTracks().length);
      // Show local preview for sender
      try {
        videoEl.srcObject = stream;
        // Ensure autoplay works
        // @ts-ignore
        if (typeof videoEl.muted === 'boolean') videoEl.muted = true;
        await videoEl.play().catch(()=>{});
      } catch {}
      stream.getTracks().forEach(t => {
        console.log('Adding track:', t.kind);
        pc.addTrack(t, stream);
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.onopen = () => {
        console.log('Sending offer');
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
      };
    } catch (error: any) {
      console.error('Error getting user media:', error);
      const reason = (error && error.name) ? error.name : 'Unknown error';
      alert(`Camera access failed (${reason}). Please grant camera permission in browser settings or open this link in Chrome/Safari instead of an in-app browser.`);
    }
  }

  return { pc, data, ws };
}
