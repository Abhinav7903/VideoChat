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
  setCallId(); // Call the setCallId function to generate and set the callId
  navigator.clipboard.writeText(callId);
  printCallId(); // Call the printCallId function to print the callId
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
};

// ... (the rest of your existing code)

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

};

// hangupcall
hangupButton.onclick = async () => {
  const callId = callInput.value;
  
  const callDoc = doc(db, 'calls', callId);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  // Update the document to indicate hangup
  await updateDoc(callDoc, { hangup: true });

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
  // reset the remote stream
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

function   resetWebpage(){
    location.reload();
}

// 5. Share Screen 
const shareScreen = document.getElementById('shareScreenButton');
let mediaStream = null;
const stopScreenButton= document.getElementById('stopScreenButton');

shareScreen.onclick = async () => {
  try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
              cursor: "always"
          },
          audio: false
      });
  } catch (ex) {
      console.log("Error occurred", ex);
  }

  // Push tracks from local stream to peer connection
  mediaStream.getTracks().forEach((track) => {
      pc.addTrack(track, mediaStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      // Refresh remote video source with the updated remoteStream
      remoteVideo.srcObject = remoteStream;
  };

  // Update local and remote video sources
  webcamVideo.srcObject = mediaStream;
  remoteVideo.srcObject = remoteStream;

  // Disable the share screen button and enable the stop screen button
  shareScreen.disabled = true;
  stopScreenButton.disabled = false;
};

// 6. Stop Screen Sharing
stopScreenButton.onclick = async () => {
    // Remove tracks from local stream to peer connection
    mediaStream.getTracks().forEach((track) => {
        pc.removeTrack(track, mediaStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
        remoteStream.removeTrack(event.track);
    };

    // screenshare visible to local
    webcamVideo.srcObject = localStream;
    // screenshare visible to remote
    remoteVideo.srcObject = remoteStream;

    // disable the share screen button
    shareScreen.disabled = false;
    stopScreenButton.disabled = true;

}