const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const call = document.getElementById("call");
const chat = document.getElementById("chat");
const chatUl = chat.querySelector("ul");
const chatForm = document.getElementById("chatForm");

call.hidden = true;
call.style.display = "none";

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection;
let myDataChannel;
let roomList;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label == camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" }
  };
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } }
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstrains
    );
    myFace.srcObject = myStream;

    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "mute";
    muted = false;
  }
}

function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera ON";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

function handleChatForm(event) {
  event.preventDefault();
  const input = chatForm.querySelector("input");
  myDataChannel.send(input.value);
  const li = document.createElement("li");
  li.innerText = `You: ${input.value}`;
  chatUl.appendChild(li);
  input.value = "";
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);
chatForm.addEventListener("submit", handleChatForm);

// welcome Form (join a room)

const welcome = document.getElementById("welcome");
const welcomeForm = document.getElementById("welcomeForm");
const welcomeInput = welcomeForm.querySelector("input");
const welcomeBtn = welcomeForm.querySelector("button");
const menu = document.getElementById("menu");
const existText = menu.querySelector("p");

existText.style.visibility = "hidden";
welcomeBtn.innerText = "Create Room";

async function initCall() {
  welcome.hidden = true;
  welcome.style.display = "none";
  call.hidden = false;
  call.style.display = "flex";
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  await initCall();
  socket.emit("join_room", input.value);
  roomName = input.value;
  input.value = "";
}

async function handleWelcomeInput(event) {
  await socket.emit("load_rooms");
  existText.style.visibility = "hidden";
  welcomeBtn.innerText = "Create Room";
  roomList.forEach((value) => {
    if (value == event.target.value) {
      existText.style.visibility = "visible";
      welcomeBtn.innerText = "Join Room";
      return;
    }
  });
}

function handleUpdateBtn() {
  socket.emit("load_rooms");
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);
welcomeInput.addEventListener("input", handleWelcomeInput);

// socket Code

socket.on("load_rooms", (publicRooms) => {
  roomList = publicRooms;
});

socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => {
    const li = document.createElement("li");
    li.innerText = `Anon: ${event.data}`;
    li.classList = "anonChat";
    chatUl.appendChild(li);
  });
  console.log("make data channel");
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  console.log("sent the offer");
  socket.emit("offer", offer, roomName);
});

socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (data) => {
    myDataChannel = data.channel;
    myDataChannel.addEventListener("message", (event) => {
      const li = document.createElement("li");
      li.innerText = `Anon: ${event.data}`;
      li.classList = "anonChat";
      chatUl.appendChild(li);
    });
  });
  console.log("received the offer");
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName);
  console.log("sent the answer");
});

socket.on("answer", (answer) => {
  console.log("received the answer");
  myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(ice);
});

// RTC Code

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302"
        ]
      }
    ]
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddstream);
  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent candidate");
  socket.emit("ice", data.candidate, roomName);
}

function handleAddstream(data) {
  const peerFace = document.getElementById("peerFace");
  console.log("peer's Stream", data.stream);
  peerFace.srcObject = data.stream;
}
