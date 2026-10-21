/**
 * oyente.js — RADIO UNAB
 * Reproductor via YouTube IFrame API + chat en tiempo real
 */

const socket = io({ query: { rol: "oyente" } });

// ── DOM ──────────────────────────────────────────────────────────
const imgCaratula    = document.getElementById("img-caratula");
const diskWrap       = document.getElementById("disk-wrap");
const diskGlow       = document.getElementById("disk-glow");
const eqBars         = document.getElementById("eq-bars");
const livePill       = document.getElementById("live-pill");
const programaNombre = document.getElementById("programa-nombre");
const cancionNombre  = document.getElementById("cancion-nombre");
const artistaNombre  = document.getElementById("artista-nombre");
const oyentesCount   = document.getElementById("oyentes-count");
const miApodoEl      = document.getElementById("mi-apodo");
const msgsContainer  = document.getElementById("mensajes-container");
const chatForm       = document.getElementById("chat-form");
const inputMensaje   = document.getElementById("input-mensaje");

const btnPlay        = document.getElementById("btn-play");
const iconPlay       = document.getElementById("icon-play");
const iconPause      = document.getElementById("icon-pause");
const btnMute        = document.getElementById("btn-mute");
const iconVolOn      = document.getElementById("icon-vol-on");
const iconVolOff     = document.getElementById("icon-vol-off");
const sliderVolumen  = document.getElementById("slider-volumen");
const volPct         = document.getElementById("vol-pct");
const estadoTxt      = document.getElementById("estado-txt");

// ── Estado ───────────────────────────────────────────────────────
let miApodoLocal = "";
let ytPlayer     = null;
let ytIdActivo   = null;
let reproduciendo= false;
let muteado      = false;
let volActual    = 100;
let ytAPILista   = false;
let pendienteId  = null;

// ── YouTube IFrame API ───────────────────────────────────────────
const ytTag = document.createElement("script");
ytTag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytTag);

window.onYouTubeIframeAPIReady = function () {
  ytAPILista = true;
  if (pendienteId) { iniciarPlayer(pendienteId); pendienteId = null; }
};

function iniciarPlayer(videoId) {
  if (ytPlayer) {
    ytPlayer.loadVideoById(videoId);
    ytIdActivo = videoId;
  } else {
    ytPlayer = new YT.Player("yt-player-container", {
      width: "1", height: "1",
      videoId,
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: (e) => {
          e.target.setVolume(volActual);
          if (muteado) e.target.mute();
          ytIdActivo = videoId;
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING)       setEstado(true);
          else if (e.data === YT.PlayerState.PAUSED ||
                   e.data === YT.PlayerState.ENDED)    setEstado(false);
          else if (e.data === YT.PlayerState.BUFFERING) setEstadoTxt("Cargando...");
        },
        onError: () => setEstadoTxt("Error al cargar el video")
      }
    });
  }
}

function cargarVideo(url) {
  const id = ytId(url);
  if (!id || id === ytIdActivo) return;
  if (!ytAPILista) { pendienteId = id; setEstadoTxt("Preparando..."); return; }
  iniciarPlayer(id);
}

// ── Controles ────────────────────────────────────────────────────
btnPlay.addEventListener("click", () => {
  if (!ytPlayer) { setEstadoTxt("Esperando que el locutor ponga una canción..."); return; }
  reproduciendo ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
});

sliderVolumen.addEventListener("input", () => {
  volActual = parseInt(sliderVolumen.value);
  volPct.textContent = volActual + "%";
  actualizarSlider();
  if (ytPlayer) ytPlayer.setVolume(volActual);
  if (muteado && volActual > 0) {
    muteado = false;
    if (ytPlayer) ytPlayer.unMute();
    iconVolOn.style.display = "block";
    iconVolOff.style.display = "none";
  }
});

btnMute.addEventListener("click", () => {
  muteado = !muteado;
  if (ytPlayer) muteado ? ytPlayer.mute() : ytPlayer.unMute();
  iconVolOn.style.display  = muteado ? "none" : "block";
  iconVolOff.style.display = muteado ? "block" : "none";
});

function actualizarSlider() {
  sliderVolumen.style.background =
    `linear-gradient(to right, var(--acc) ${volActual}%, var(--input) ${volActual}%)`;
}
actualizarSlider();

// ── Visual ───────────────────────────────────────────────────────
function setEstado(playing) {
  reproduciendo = playing;
  iconPlay.style.display  = playing ? "none" : "block";
  iconPause.style.display = playing ? "block" : "none";
  btnPlay.classList.toggle("playing", playing);
  diskWrap.classList.toggle("spinning", playing);
  diskGlow.classList.toggle("active", playing);
  eqBars.classList.toggle("active", playing);
  imgCaratula.classList.toggle("playing", playing);
  setEstadoTxt(playing ? "Reproduciendo en vivo" : "Pausado");
}

function setEstadoTxt(t) { estadoTxt.textContent = t; }

// ── Utilidades ───────────────────────────────────────────────────
function ytId(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0].split("/")[0];
    if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1].split("?")[0];
    return u.searchParams.get("v") || null;
  } catch {
    const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function inits(apodo) {
  const p = apodo.split("_");
  return (p[0]?.[0] || "?") + (p[1]?.[0] || "");
}

function scrollFin() { msgsContainer.scrollTop = msgsContainer.scrollHeight; }

// ── Chat ─────────────────────────────────────────────────────────
function renderMsg(msg, hist = false) {
  if (msg.tipo === "sistema") {
    const d = document.createElement("div");
    d.className = "msg-sys"; d.textContent = msg.texto;
    msgsContainer.appendChild(d);
    if (!hist) scrollFin(); return;
  }
  const soyYo = msg.apodo === miApodoLocal;
  const esLoc  = msg.tipo === "locutor";

  const wrap = document.createElement("div"); wrap.className = "msg";
  const av   = document.createElement("div");
  av.className = `msg-av ${esLoc ? "av-loc" : "av-user"}`;
  av.textContent = inits(msg.apodo);

  const body = document.createElement("div"); body.className = "msg-body";
  const meta = document.createElement("div"); meta.className = "msg-meta";

  const name = document.createElement("span");
  name.className = "msg-name" + (esLoc ? " is-loc" : "") + (soyYo ? " is-me" : "");
  name.textContent = esLoc ? `🎙️ ${msg.apodo}` : soyYo ? `${msg.apodo} (tú)` : msg.apodo;

  const time = document.createElement("span");
  time.className = "msg-time"; time.textContent = hora(msg.timestamp);

  const txt = document.createElement("p");
  txt.className = "msg-text"; txt.textContent = msg.texto;

  meta.appendChild(name); meta.appendChild(time);
  body.appendChild(meta); body.appendChild(txt);
  wrap.appendChild(av); wrap.appendChild(body);
  msgsContainer.appendChild(wrap);
  if (!hist) scrollFin();
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = inputMensaje.value.trim();
  if (!texto || !miApodoLocal) return;
  socket.emit("enviarMensaje", { texto });
  inputMensaje.value = "";
  inputMensaje.focus();
});

// ── Socket ───────────────────────────────────────────────────────
socket.on("bienvenida", (d) => {
  miApodoLocal = d.apodo;
  miApodoEl.textContent = d.apodo;
  aplicar(d.estadoRadio);
  oyentesCount.textContent = d.oyentesCount;
});

socket.on("historialChat",     (h) => { h.forEach(m => renderMsg(m, true)); scrollFin(); });
socket.on("nuevoMensaje",      renderMsg);
socket.on("mensajeSistema",    renderMsg);
socket.on("cancionActualizada", aplicar);
socket.on("actualizarOyentes", (d) => { oyentesCount.textContent = d.count; });
socket.on("estadoEnVivo",      (d) => { livePill.classList.toggle("offline", !d.enVivo); });

function aplicar(e) {
  if (!e) return;
  if (e.cancionActual)  cancionNombre.textContent  = e.cancionActual;
  if (e.artista)        artistaNombre.textContent  = e.artista;
  if (e.programaActual) programaNombre.textContent = e.programaActual;
  if (e.caratula)       imgCaratula.src            = e.caratula;
  if (!e.enVivo)        livePill.classList.add("offline");
  if (e.youtubeUrl) {
    const id = ytId(e.youtubeUrl);
    if (id && id !== ytIdActivo) cargarVideo(e.youtubeUrl);
  }
}

// ─── VOZ EN VIVO (WebRTC) ────────────────────────────────────────────────────
let pcVoz       = null;  // RTCPeerConnection con el locutor
let audioLocutor = null; // elemento <audio> para reproducir la voz
const vozConfig  = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/**
 * El locutor activó el micrófono — pausa el video de YouTube en el oyente
 * y se prepara para recibir el audio.
 */
socket.on("voz-inicio", () => {
  setEstadoTxt("🎙️ El locutor está hablando...");
  // Pausa el video de YouTube localmente
  if (ytPlayer && reproduciendo) ytPlayer.pauseVideo();
});

/**
 * El locutor dejó el aire — reanuda YouTube
 */
socket.on("voz-fin", () => {
  setEstadoTxt("Reproduciendo en vivo");
  // Cierra la conexión WebRTC
  if (pcVoz) { pcVoz.close(); pcVoz = null; }
  // Reanuda YouTube
  if (ytPlayer) ytPlayer.playVideo();
});

/**
 * Recibe la oferta WebRTC del locutor y responde.
 */
socket.on("voz-oferta", async (data) => {
  try {
    const señal = data.señal;

    if (señal.type === "offer") {
      // Nueva conexión
      pcVoz = new RTCPeerConnection(vozConfig);

      // Cuando llega el audio del locutor, lo reproduce
      pcVoz.ontrack = (e) => {
        if (!audioLocutor) {
          audioLocutor = document.createElement("audio");
          audioLocutor.autoplay = true;
          audioLocutor.style.display = "none";
          document.body.appendChild(audioLocutor);
        }
        audioLocutor.srcObject = e.streams[0];
      };

      // Envía candidatos ICE al locutor
      pcVoz.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("voz-respuesta", {
            locutor: data.locutor,
            señal: { type: "candidate", candidate: e.candidate }
          });
        }
      };

      await pcVoz.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: señal.sdp }));
      const respuesta = await pcVoz.createAnswer();
      await pcVoz.setLocalDescription(respuesta);

      socket.emit("voz-respuesta", {
        locutor: data.locutor,
        señal: { type: "answer", sdp: respuesta.sdp }
      });

    } else if (señal.type === "candidate" && pcVoz) {
      await pcVoz.addIceCandidate(new RTCIceCandidate(señal.candidate));
    }
  } catch (e) { console.warn("[WebRTC] Error oyente:", e); }
});
