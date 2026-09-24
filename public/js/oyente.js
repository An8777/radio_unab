/**
 * oyente.js — RADIO UNAB · Panel del Oyente
 * Reproductor via YouTube IFrame API (el iframe lo crea la propia API).
 */

// ─── Conexión al servidor ────────────────────────────────────────────────────
const socket = io({ query: { rol: "oyente" } });

// ─── DOM ─────────────────────────────────────────────────────────────────────
const imgCaratula       = document.getElementById("img-caratula");
const caratulaRing      = document.getElementById("caratula-ring");
const programaNombre    = document.getElementById("programa-nombre");
const cancionNombre     = document.getElementById("cancion-nombre");
const artistaNombre     = document.getElementById("artista-nombre");
const oyentesCount      = document.getElementById("oyentes-count");
const miApodoEl         = document.getElementById("mi-apodo");
const mensajesContainer = document.getElementById("mensajes-container");
const chatForm          = document.getElementById("chat-form");
const inputMensaje      = document.getElementById("input-mensaje");
const badgeEnVivo       = document.getElementById("badge-envivo");
const btnPlay           = document.getElementById("btn-play");
const iconPlay          = document.getElementById("icon-play");
const iconPause         = document.getElementById("icon-pause");
const btnMute           = document.getElementById("btn-mute");
const iconVolOn         = document.getElementById("icon-vol-on");
const iconVolOff        = document.getElementById("icon-vol-off");
const sliderVolumen     = document.getElementById("slider-volumen");
const volPct            = document.getElementById("vol-pct");
const audioBars         = document.getElementById("audio-bars");
const estadoTxt         = document.getElementById("estado-txt");

// ─── Estado ──────────────────────────────────────────────────────────────────
let miApodoLocal  = "";
let ytPlayer      = null;    // instancia YT.Player
let ytIdActivo    = null;    // ID del video activo
let reproduciendo = false;
let muteado       = false;
let volActual     = 100;
let ytAPILista    = false;
let pendienteId   = null;    // video esperando a que la API esté lista

// ─── YouTube IFrame API ──────────────────────────────────────────────────────
// Carga el script de la API dinámicamente
const tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

/**
 * Callback global que YouTube llama cuando la API está lista.
 * DEBE estar en window para que la API lo encuentre.
 */
window.onYouTubeIframeAPIReady = function () {
  ytAPILista = true;
  // Si ya había un video esperando, lo cargamos ahora
  if (pendienteId) {
    iniciarPlayer(pendienteId);
    pendienteId = null;
  }
};

/**
 * Crea el YT.Player la primera vez o carga un nuevo video si ya existe.
 * La API crea el iframe dentro de #yt-player-container.
 */
function iniciarPlayer(videoId) {
  if (ytPlayer) {
    // El player ya existe: solo cambia el video
    ytPlayer.loadVideoById(videoId);
    ytIdActivo = videoId;
    // loadVideoById arranca solo; el evento onStateChange actualizará el estado
  } else {
    // Primera vez: crear el player (la API inyecta el iframe en el div)
    ytPlayer = new YT.Player("yt-player-container", {
      width: "1",
      height: "1",
      videoId: videoId,
      playerVars: {
        autoplay:        1,
        controls:        0,
        modestbranding:  1,
        rel:             0,
        iv_load_policy:  3,
        playsinline:     1
      },
      events: {
        onReady: function (e) {
          e.target.setVolume(volActual);
          if (muteado) e.target.mute();
          ytIdActivo = videoId;
          // onReady dispara antes de que empiece a sonar;
          // el estado visual lo actualizamos en onStateChange
        },
        onStateChange: function (e) {
          switch (e.data) {
            case YT.PlayerState.PLAYING:
              setEstado(true);
              break;
            case YT.PlayerState.PAUSED:
            case YT.PlayerState.ENDED:
              setEstado(false);
              break;
            case YT.PlayerState.BUFFERING:
              setEstadoTxt("Cargando...");
              break;
          }
        },
        onError: function (e) {
          setEstadoTxt("Error al cargar el video (" + e.data + ")");
        }
      }
    });
  }
}

/**
 * Punto de entrada para cargar un video dado su URL de YouTube.
 * Maneja el caso de que la API aún no esté lista.
 */
function cargarVideo(youtubeUrl) {
  const id = extraerYoutubeId(youtubeUrl);
  if (!id) return;
  if (id === ytIdActivo) return; // mismo video, nada que hacer

  if (!ytAPILista) {
    pendienteId = id;
    setEstadoTxt("Preparando el reproductor...");
    return;
  }

  iniciarPlayer(id);
}

// ─── Botón Play / Pausa ──────────────────────────────────────────────────────
btnPlay.addEventListener("click", () => {
  if (!ytPlayer) {
    setEstadoTxt("Esperando que el locutor ponga una canción...");
    return;
  }
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

// ─── Volumen ─────────────────────────────────────────────────────────────────
sliderVolumen.addEventListener("input", () => {
  volActual = parseInt(sliderVolumen.value);
  volPct.textContent = volActual + "%";
  actualizarSlider();
  if (ytPlayer) ytPlayer.setVolume(volActual);
  // Si sube el volumen estando muteado, desmutea
  if (muteado && volActual > 0) {
    muteado = false;
    if (ytPlayer) ytPlayer.unMute();
    iconVolOn.style.display  = "block";
    iconVolOff.style.display = "none";
  }
});

btnMute.addEventListener("click", () => {
  muteado = !muteado;
  if (ytPlayer) muteado ? ytPlayer.mute() : ytPlayer.unMute();
  iconVolOn.style.display  = muteado ? "none"  : "block";
  iconVolOff.style.display = muteado ? "block" : "none";
});

function actualizarSlider() {
  sliderVolumen.style.background =
    `linear-gradient(to right, var(--accent) ${volActual}%, var(--bg-input) ${volActual}%)`;
}
actualizarSlider(); // estado inicial

// ─── Helpers visuales ────────────────────────────────────────────────────────
function setEstado(playing) {
  reproduciendo = playing;
  iconPlay.style.display  = playing ? "none"  : "block";
  iconPause.style.display = playing ? "block" : "none";
  audioBars.classList.toggle("activo", playing);
  caratulaRing.classList.toggle("girando", playing);
  setEstadoTxt(playing ? "Reproduciendo en vivo" : "Pausado — clic ▶ para continuar");
}

function setEstadoTxt(txt) { estadoTxt.textContent = txt; }

// ─── Utilidades ──────────────────────────────────────────────────────────────
function extraerYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    return u.searchParams.get("v") || null;
  } catch { return null; }
}

function formatearHora(iso) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function iniciales(apodo) {
  const p = apodo.split("_");
  return (p[0]?.[0] || "?") + (p[1]?.[0] || "");
}

function scrollAlFinal() {
  mensajesContainer.scrollTop = mensajesContainer.scrollHeight;
}

// Escapa HTML solo para insertar en atributos; para textContent no hace falta
function escaparHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function renderizarMensaje(msg, esHistorial = false) {
  if (msg.tipo === "sistema") {
    const div = document.createElement("div");
    div.className = "mensaje-sistema";
    div.textContent = msg.texto; // textContent evita XSS sin escapar manualmente
    mensajesContainer.appendChild(div);
    if (!esHistorial) scrollAlFinal();
    return;
  }

  const soyYo = msg.apodo === miApodoLocal;
  const esLoc = msg.tipo === "locutor";

  const div = document.createElement("div");
  div.className = "mensaje";

  const avatar = document.createElement("div");
  avatar.className = `mensaje-avatar ${esLoc ? "avatar-locutor" : "avatar-oyente"}`;
  avatar.textContent = iniciales(msg.apodo);

  const body = document.createElement("div");
  body.className = "mensaje-body";

  const meta = document.createElement("div");
  meta.className = "mensaje-meta";

  const apodoEl = document.createElement("span");
  apodoEl.className = "mensaje-apodo" +
    (esLoc ? " apodo-locutor" : "") + (soyYo ? " apodo-yo" : "");
  // textContent asigna texto plano, sin riesgo de XSS
  apodoEl.textContent = esLoc
    ? `🎙️ ${msg.apodo}`
    : soyYo ? `${msg.apodo} (tú)` : msg.apodo;

  const horaEl = document.createElement("span");
  horaEl.className = "mensaje-hora";
  horaEl.textContent = formatearHora(msg.timestamp);

  const textoEl = document.createElement("p");
  textoEl.className = "mensaje-texto";
  textoEl.textContent = msg.texto; // textContent — sin doble escape

  meta.appendChild(apodoEl);
  meta.appendChild(horaEl);
  body.appendChild(meta);
  body.appendChild(textoEl);
  div.appendChild(avatar);
  div.appendChild(body);
  mensajesContainer.appendChild(div);

  if (!esHistorial) scrollAlFinal();
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = inputMensaje.value.trim();
  if (!texto || !miApodoLocal) return;
  socket.emit("enviarMensaje", { texto });
  inputMensaje.value = "";
  inputMensaje.focus();
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
socket.on("bienvenida", (data) => {
  miApodoLocal = data.apodo;
  miApodoEl.textContent = data.apodo;
  aplicarEstado(data.estadoRadio);
  oyentesCount.textContent = data.oyentesCount;
});

socket.on("historialChat",     (h) => { h.forEach((m) => renderizarMensaje(m, true)); scrollAlFinal(); });
socket.on("nuevoMensaje",      (m) => renderizarMensaje(m));
socket.on("mensajeSistema",    (m) => renderizarMensaje(m));
socket.on("cancionActualizada",(e) => aplicarEstado(e));
socket.on("actualizarOyentes", (d) => { oyentesCount.textContent = d.count; });
socket.on("estadoEnVivo",      (d) => { badgeEnVivo.classList.toggle("offline", !d.enVivo); });

function aplicarEstado(estado) {
  if (!estado) return;
  if (estado.cancionActual)  cancionNombre.textContent  = estado.cancionActual;
  if (estado.artista)        artistaNombre.textContent  = estado.artista;
  if (estado.programaActual) programaNombre.textContent = estado.programaActual;
  if (estado.caratula)       imgCaratula.src            = estado.caratula;
  if (!estado.enVivo)        badgeEnVivo.classList.add("offline");

  if (estado.youtubeUrl) {
    const id = extraerYoutubeId(estado.youtubeUrl);
    if (id && id !== ytIdActivo) cargarVideo(estado.youtubeUrl);
  }
}
