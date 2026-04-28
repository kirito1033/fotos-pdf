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

function capturePhoto() {
  if (!stream) return;

  const context = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL("image/jpeg", 0.92);
  photos.push({
    id: Date.now(),
    dataUrl: imageData
  });

  pdfBlob = null;
  renderGallery();
  setStatus(`foto capturada (${photos.length})`);
  updateButtons();
}

function renderGallery() {
  gallery.innerHTML = "";

  photos.forEach((photo, index) => {
    const item = document.createElement("div");
    item.className = "photo-item";

    item.innerHTML = `
      <img src="${photo.dataUrl}" alt="Foto ${index + 1}">
      <div class="photo-meta">Foto ${index + 1}</div>
    `;

    gallery.appendChild(item);
  });

  updateButtons();
}

function fitImageInPage(imgWidth, imgHeight, pageWidth, pageHeight, margin = 10) {
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  let renderWidth = maxWidth;
  let renderHeight = (imgHeight * renderWidth) / imgWidth;

  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = (imgWidth * renderHeight) / imgHeight;
  }

  const x = (pageWidth - renderWidth) / 2;
  const y = (pageHeight - renderHeight) / 2;

  return { x, y, renderWidth, renderHeight };
}

async function generatePdf() {
  if (!photos.length) {
    alert("No hay fotos para generar el PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < photos.length; i++) {
    const img = new Image();
    img.src = photos[i].dataUrl;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    if (i > 0) {
      pdf.addPage();
    }

    const { x, y, renderWidth, renderHeight } = fitImageInPage(
      img.width,
      img.height,
      pageWidth,
      pageHeight
    );

    pdf.addImage(photos[i].dataUrl, "JPEG", x, y, renderWidth, renderHeight);
  }

  pdfBlob = pdf.output("blob");

  const fileName = `fotos_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`;
  pdf.save(fileName);

  setStatus("PDF generado y descargado");
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
