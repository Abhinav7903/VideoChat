// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBBCnYSogOwJndZnpQDX3UqwnoVE5e0pX4",
  authDomain: "testing-of-rooms.firebaseapp.com",
  databaseURL: "https://testing-of-rooms-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testing-of-rooms",
  storageBucket: "testing-of-rooms.appspot.com",
  messagingSenderId: "312270868964",
  appId: "1:312270868964:web:e2ab17d94eecf729f0b7f1",
  measurementId: "G-KTEK30Y6M7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

// WebRTC configuration
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let callId;
let peer;
let answerpeer;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
  remoteStream = new MediaStream();
  webcamVideo.muted = true;

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    remoteStream.addTrack(event.track);
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// Function to set the callId
function setCallId() {
  callId = Math.floor(Math.random() * 1000000000).toString();
  // Additional logic if needed...
}

// Function that uses the callId
function printCallId() {
  console.log('Current callId:', callId);
}

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  setCallId();
  navigator.clipboard.writeText(callId);
  printCallId();
  alert('Call ID has been copied to clipboard');

  const callDoc = doc(db, 'calls', callId);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  callInput.value = '';

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDoc, { offer });

  // Listen for remote answer
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  hangupButton.disabled = false;
  peer = { peerConnection: pc };
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = doc(db, 'calls', callId);
  const answerCandidates = collection(callDoc, 'answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
  };

  const callData = (await getDoc(callDoc)).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDoc, { answer });

  onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  hangupButton.disabled = false;
  answerpeer = { peerConnection: pc };
};

// Hang up the call
hangupButton.onclick = async () => {
  callId;

  const anscallid = callInput.value;
  // either callId or anscallid will be valid
  if (!callId && !anscallid) {
    console.error('Invalid callId:', callId);
    return;
  }

  const selectedCallId = callId || anscallid;
  const callDoc = doc(db, 'calls', selectedCallId);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  // Update the document to indicate hangup
  await updateDoc(callDoc, { hangup: true }).catch((error) => {
    console.error('Error updating hangup status:', error);
  });

  // Delete offerCandidates documents
  const offerQuerySnapshot = await getDocs(offerCandidates);
  offerQuerySnapshot.forEach((doc) => {
    deleteDoc(doc.ref);
  });

  // Delete answerCandidates documents
  const answerQuerySnapshot = await getDocs(answerCandidates);
  answerQuerySnapshot.forEach((doc) => {
    deleteDoc(doc.ref);
  });

  // Close the peer connection
  pc.close();

  // Reset the remote stream
  remoteStream = new MediaStream();

  // Remove event listeners and reset streams
  pc.onicecandidate = null;
  pc.ontrack = null;
  pc.onremovetrack = null;
  pc.oniceconnectionstatechange = null;
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  webcamButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;
  resetWebpage();
};


// Function to reset the webpage
function resetWebpage() {
  location.reload();
}

// 5. Share Screen

let mediaStream = null;
const stopScreenButton = document.getElementById('stopScreenButton');
let screenSharing = false;
let screenStream;

document.getElementById('shareScreenButton').addEventListener('click', () => {
  if (screenSharing) {
    // If already sharing, stop screen sharing
    stopScreenSharing(peer, answerpeer);
  } else {
    // If not sharing, start screen sharing with the appropriate peer
    startScreenShare(answerpeer || peer);
  }
});

function startScreenShare(peer) {
  if (screenSharing) return;
  navigator.mediaDevices.getDisplayMedia({ video: true }).then((mediaStream) => {
    screenStream = mediaStream;
    let videoTrack = mediaStream.getVideoTracks()[0];
    videoTrack.onended = function () {
      stopScreenSharing(peer);
    };
    if (peer) {
      let sender = peer.peerConnection.getSenders().find(function (s) {
        return s.track.kind == videoTrack.kind;
      });
      sender.replaceTrack(videoTrack);
    }
    screenSharing = true;
  });
}

stopScreenButton.addEventListener('click', () => {
  stopScreenSharing(peer, answerpeer);
});

function stopScreenSharing(peer) {
  if (!screenSharing) return;
  let videoTrack = localStream.getVideoTracks()[0];
  if (peer) {
    let sender = peer.peerConnection.getSenders().find(function (s) {
      return s.track.kind == videoTrack.kind;
    });
    sender.replaceTrack(videoTrack);
  }
  screenStream.getTracks().forEach(function (track) {
    track.stop();
  });
  screenSharing = false;
}