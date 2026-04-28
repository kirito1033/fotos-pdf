const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const gallery = document.getElementById("gallery");
const statusText = document.getElementById("status");
const photoCount = document.getElementById("photoCount");

const startCameraBtn = document.getElementById("startCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const generatePdfBtn = document.getElementById("generatePdfBtn");
const uploadDriveBtn = document.getElementById("uploadDriveBtn");
const clearPhotosBtn = document.getElementById("clearPhotosBtn");

let stream = null;
let photos = [];
let pdfBlob = null;
let currentFacingMode = "environment";

function setStatus(message) {
  statusText.textContent = `Estado: ${message}`;
}

function updateButtons() {
  const hasStream = !!stream;
  const hasPhotos = photos.length > 0;
  captureBtn.disabled = !hasStream;
  switchCameraBtn.disabled = !hasStream;
  stopCameraBtn.disabled = !hasStream;
  generatePdfBtn.disabled = !hasPhotos;
  uploadDriveBtn.disabled = !pdfBlob;
  clearPhotosBtn.disabled = !hasPhotos;
  photoCount.textContent = `${photos.length} foto${photos.length === 1 ? "" : "s"}`;
}

async function startCamera() {
  try {
    if (stream) {
      stopCamera();
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: currentFacingMode } },
      audio: false
    });

    video.srcObject = stream;
    setStatus(`cámara activa (${currentFacingMode})`);
    updateButtons();
  } catch (error) {
    console.error(error);
    setStatus("no se pudo abrir la cámara");
    alert("Error al abrir la cámara. Verifica permisos y que estés en HTTPS o localhost.");
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    setStatus("cámara detenida");
    updateButtons();
  }
}

async function switchCamera() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  await startCamera();
}

async function capturePhoto() {
  if (!stream) return;

  setStatus("obteniendo ubicación y clima...");

  const location = await getCurrentLocation();
  let weather = null;

  if (location) {
    weather = await getWeather(location.latitude, location.longitude);
  }

  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const now = new Date();
  const fecha = now.toLocaleDateString();
  const hora = now.toLocaleTimeString();

  const lines = [
    "WEFONE",
    `Fecha: ${fecha}`,
    `Hora: ${hora}`,
    location
      ? `Lugar: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
      : "Lugar: no disponible",
    weather
      ? `Clima: ${weather.condition} - ${weather.temperature}°C`
      : "Clima: no disponible"
  ];

  const fontSize = Math.max(18, Math.floor(canvas.width * 0.022));
  const lineHeight = fontSize + 8;
  const padding = 20;
  const boxWidth = canvas.width * 0.52;
  const boxHeight = lines.length * lineHeight + padding * 2;
  const boxX = canvas.width - boxWidth - 20;
  const boxY = canvas.height - boxHeight - 20;

  context.globalAlpha = 0.72;
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.fillRect(boxX, boxY, boxWidth, boxHeight);

  context.globalAlpha = 1;
  context.fillStyle = "#ffffff";
  context.font = `bold ${fontSize}px Arial`;
  context.textAlign = "left";
  context.textBaseline = "top";

  lines.forEach((line, index) => {
    context.fillText(line, boxX + padding, boxY + padding + index * lineHeight);
  });

  const imageData = canvas.toDataURL("image/jpeg", 0.92);

  photos.push({
    id: Date.now(),
    dataUrl: imageData
  });

  pdfBlob = null;
  renderGallery();
  setStatus(`foto capturada con marca WEFONE (${photos.length})`);
  updateButtons();
}

function clearPhotos() {
  photos = [];
  pdfBlob = null;
  renderGallery();
  setStatus("fotos eliminadas");
  updateButtons();
}

/* =========================
   SUBIDA A GOOGLE DRIVE
   =========================
   Debes reemplazar CLIENT_ID por el tuyo.
   También debes habilitar Google Drive API en Google Cloud.
*/
const CLIENT_ID = "316174189750-auumsrhlf67pjjh0gjei3phf04mg184o.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let gapiReady = false;
let gisReady = false;

function initializeGoogleClients() {
  if (window.gapi) {
    gapi.load("client", async () => {
      await gapi.client.init({
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
      });
      gapiReady = true;
    });
  }

  const gisInterval = setInterval(() => {
    if (window.google?.accounts?.oauth2) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: ""
      });
      gisReady = true;
      clearInterval(gisInterval);
    }
  }, 500);
}

async function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function getWeather(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
    const response = await fetch(url);
    const data = await response.json();

    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;

    return {
      temperature: temp ?? "N/D",
      condition: getWeatherDescription(code)
    };
  } catch (error) {
    console.error("Error consultando clima:", error);
    return null;
  }
}

function getWeatherDescription(code) {
  const map = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcial nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna moderada",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia moderada",
    65: "Lluvia fuerte",
    71: "Nieve ligera",
    73: "Nieve moderada",
    75: "Nieve fuerte",
    80: "Chubascos ligeros",
    81: "Chubascos moderados",
    82: "Chubascos fuertes",
    95: "Tormenta"
  };
  return map[code] || "Clima no disponible";
}

async function uploadToDrive() {
  if (!pdfBlob) {
    alert("Primero debes generar el PDF.");
    return;
  }

  if (CLIENT_ID === "TU_CLIENT_ID_AQUI") {
    alert("Debes configurar tu CLIENT_ID de Google antes de subir a Drive.");
    return;
  }

  if (!gapiReady || !gisReady) {
    alert("Google API aún no está lista. Espera unos segundos e intenta de nuevo.");
    return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error) {
      console.error(resp);
      alert("No fue posible autorizar con Google.");
      return;
    }

    try {
      const metadata = {
        name: `fotos_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`,
        mimeType: "application/pdf"
      };

      const accessToken = gapi.client.getToken().access_token;
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", pdfBlob);

      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
        body: form
      });

      const result = await response.json();

      if (result.id) {
        setStatus("PDF subido a Google Drive correctamente");
        alert("Archivo subido a Google Drive con éxito.");
      } else {
        console.error(result);
        alert("No se pudo subir el archivo a Drive.");
      }
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error subiendo el PDF a Drive.");
    }
  };

  const existingToken = gapi.client.getToken();
  if (existingToken === null) {
    tokenClient.requestAccessToken({ prompt: "consent" });
  } else {
    tokenClient.requestAccessToken({ prompt: "" });
  }
}

startCameraBtn.addEventListener("click", startCamera);
captureBtn.addEventListener("click", capturePhoto);
switchCameraBtn.addEventListener("click", switchCamera);
stopCameraBtn.addEventListener("click", stopCamera);
generatePdfBtn.addEventListener("click", generatePdf);
uploadDriveBtn.addEventListener("click", uploadToDrive);
clearPhotosBtn.addEventListener("click", clearPhotos);

initializeGoogleClients();
updateButtons();
