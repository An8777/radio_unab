/**
 * locutor.js — Lógica del panel del locutor (cabina de control)
 * Maneja: Socket.io como locutor, YouTube embed, chat en tiempo real,
 *         gestión de peticiones, actualización de info de canción.
 */

// ─── Conexión al servidor identificándose como locutor ───────────────────────
const socket = io({ query: { rol: "locutor" } });

// ─── Referencias DOM ─────────────────────────────────────────────────────────
// Header
const toggleEnVivo   = document.getElementById("toggle-envivo");
const enVivoLabel    = document.getElementById("envivo-label");
const oyentesCount   = document.getElementById("oyentes-count");

// Reproductor
const fuenteTabs     = document.querySelectorAll(".src-tab");
const panelYoutube   = document.getElementById("panel-youtube");
const panelStream    = document.getElementById("panel-stream");
const inputYoutube   = document.getElementById("input-youtube");
const btnCargarYt    = document.getElementById("btn-cargar-yt");
const ytIframe       = document.getElementById("yt-iframe");
const ytPlaceholder  = document.getElementById("yt-placeholder");
const inputStream    = document.getElementById("input-stream");
const btnAplicarStr  = document.getElementById("btn-aplicar-stream");

// Información de canción
const inpPrograma    = document.getElementById("inp-programa");
const inpCancion     = document.getElementById("inp-cancion");
const inpArtista     = document.getElementById("inp-artista");
const inpCaratula    = document.getElementById("inp-caratula");
const btnActualizar  = document.getElementById("btn-actualizar-cancion");

// Accesos rápidos
const accPausa       = document.getElementById("acc-pausa");
const accLimpiar     = document.getElementById("acc-limpiar-chat");
const accSilenciar   = document.getElementById("acc-silenciar");
const accAvisar      = document.getElementById("acc-avisar");

// Panel de peticiones
const peticionesContainer = document.getElementById("peticiones-container");
const filtrosBtns    = document.querySelectorAll(".filter-btn");
const formLocutor    = document.getElementById("form-locutor");
const inputLocutor   = document.getElementById("input-locutor");

// Toast
const toast          = document.getElementById("toast");

// ─── Estado local del locutor ────────────────────────────────────────────────
let filtroActual = "todos";        // filtro activo de peticiones
let mensajesMap  = new Map();      // id -> { elemento DOM, completado }
let ytMuteado    = false;
let ytPausado    = false;

// ─── Utilidades ──────────────────────────────────────────────────────────────

function formatearHora(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function iniciales(apodo) {
  const partes = apodo.split("_");
  return (partes[0]?.[0] || "?") + (partes[1]?.[0] || "");
}

function escaparHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scrollAlFinal() {
  peticionesContainer.scrollTop = peticionesContainer.scrollHeight;
}

/**
 * Muestra un toast temporal en la esquina inferior derecha
 */
function mostrarToast(texto, duracion = 3000) {
  toast.textContent = texto;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), duracion);
}

/**
 * Extrae el ID de un video de YouTube desde cualquier formato de URL:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://youtu.be/ID?si=TRACKING
 * - https://youtube.com/shorts/ID
 * - https://m.youtube.com/watch?v=ID
 */
function extraerYoutubeId(url) {
  try {
    const u = new URL(url.trim());
    // Formato corto: youtu.be/ID
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("?")[0].split("/")[0];
    }
    // Formato /shorts/ID
    if (u.pathname.includes("/shorts/")) {
      return u.pathname.split("/shorts/")[1].split("?")[0];
    }
    // Formato estándar: ?v=ID
    return u.searchParams.get("v") || null;
  } catch {
    // Si no es URL válida, intenta extraer con regex como último recurso
    const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
}

// ─── Toggle EN VIVO ──────────────────────────────────────────────────────────
toggleEnVivo.addEventListener("change", () => {
  const enVivo = toggleEnVivo.checked;
  enVivoLabel.textContent = enVivo ? "EN VIVO" : "OFFLINE";
  enVivoLabel.style.color  = enVivo ? "var(--accent-2)" : "var(--text-muted)";
  socket.emit("toggleEnVivo", { enVivo });
  mostrarToast(enVivo ? "✅ Radio marcada como EN VIVO" : "🔴 Radio marcada como OFFLINE");
});

// ─── Tabs de fuente (YouTube / Stream) ───────────────────────────────────────
fuenteTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    fuenteTabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    const fuente = tab.dataset.fuente;
    panelYoutube.classList.toggle("hidden", fuente !== "youtube");
    panelStream.classList.toggle("hidden", fuente !== "stream");
  });
});

// Verificación de que los elementos críticos existen
console.log("[INIT] btnCargarYt:", btnCargarYt);
console.log("[INIT] ytIframe:", ytIframe);
console.log("[INIT] inputYoutube:", inputYoutube);

// ─── Cargar video de YouTube ─────────────────────────────────────────────────
btnCargarYt.addEventListener("click", () => {
  const url = inputYoutube.value.trim();
  console.log("[YT] URL ingresada:", url);

  if (!url) return mostrarToast("⚠️ Escribe una URL de YouTube primero");

  const id = extraerYoutubeId(url);
  console.log("[YT] ID extraído:", id);

  if (!id) return mostrarToast("❌ URL no válida. Copia el link completo desde YouTube.");

  const embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0`;
  console.log("[YT] Embed URL:", embedUrl);

  ytIframe.src = embedUrl;
  ytIframe.style.display = "block";
  ytPlaceholder.style.display = "none";
  ytPausado = false;
  ytMuteado = false;

  const urlLimpia = `https://www.youtube.com/watch?v=${id}`;
  socket.emit("actualizarCancion", {
    youtubeUrl: urlLimpia,
    programa: inpPrograma.value || undefined,
    cancion:  inpCancion.value  || undefined,
    artista:  inpArtista.value  || undefined,
    caratula: inpCaratula.value || undefined
  });

  mostrarToast(`▶️ Cargando video: ${id}`);
});

// ─── Aplicar URL de stream de audio ──────────────────────────────────────────
btnAplicarStr.addEventListener("click", () => {
  const url = inputStream.value.trim();
  if (!url) return mostrarToast("⚠️ Escribe la URL del stream primero");

  socket.emit("actualizarCancion", { streamUrl: url });
  mostrarToast("📡 URL de stream enviada a oyentes");
});

// ─── Actualizar información de canción ───────────────────────────────────────
btnActualizar.addEventListener("click", () => {
  const payload = {
    programa:  inpPrograma.value.trim() || undefined,
    cancion:   inpCancion.value.trim()  || undefined,
    artista:   inpArtista.value.trim()  || undefined,
    caratula:  inpCaratula.value.trim() || undefined,
  };

  if (!payload.cancion && !payload.programa) {
    return mostrarToast("⚠️ Escribe al menos el nombre del programa o la canción");
  }

  socket.emit("actualizarCancion", payload);
  mostrarToast("✅ Información enviada a todos los oyentes");
});

// ─── Accesos rápidos ─────────────────────────────────────────────────────────

// Pausa / reanuda el iframe de YouTube via postMessage
accPausa.addEventListener("click", () => {
  if (!ytIframe.src) return mostrarToast("⚠️ No hay video cargado");
  const msg = ytPausado
    ? '{"event":"command","func":"playVideo","args":""}'
    : '{"event":"command","func":"pauseVideo","args":""}';
  ytIframe.contentWindow.postMessage(msg, "*");
  ytPausado = !ytPausado;
  accPausa.textContent = ytPausado ? "▶️ Reanudar YouTube" : "⏸️ Pausar YouTube";
  mostrarToast(ytPausado ? "⏸️ Video pausado" : "▶️ Video reanudado");
});

// Silenciar/desilenciar YouTube via postMessage
accSilenciar.addEventListener("click", () => {
  if (!ytIframe.src) return mostrarToast("⚠️ No hay video cargado");
  const msg = ytMuteado
    ? '{"event":"command","func":"unMute","args":""}'
    : '{"event":"command","func":"mute","args":""}';
  ytIframe.contentWindow.postMessage(msg, "*");
  ytMuteado = !ytMuteado;
  accSilenciar.textContent = ytMuteado ? "🔊 Desilenciar" : "🔇 Silenciar";
  mostrarToast(ytMuteado ? "🔇 Silenciado" : "🔊 Audio activo");
});

// Limpiar solo los mensajes marcados como completados de la vista local
accLimpiar.addEventListener("click", () => {
  const completados = peticionesContainer.querySelectorAll(".peticion-card.completado");
  completados.forEach((el) => el.remove());
  mostrarToast(`🗑️ ${completados.length} peticiones leídas eliminadas`);
});

// Enviar aviso de corte comercial por chat
accAvisar.addEventListener("click", () => {
  accAvisar.disabled = true;
  socket.emit("enviarMensaje", { texto: "📢 ¡En unos momentos regresamos! Corte comercial." });
  mostrarToast("📢 Aviso de corte enviado");
  setTimeout(() => { accAvisar.disabled = false; }, 5000);
});

// ─── Chat del locutor ────────────────────────────────────────────────────────
formLocutor.addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = inputLocutor.value.trim();
  if (!texto) return;
  socket.emit("enviarMensaje", { texto });
  inputLocutor.value = "";
  inputLocutor.focus();
});

// ─── Renderizado de peticiones/mensajes ─────────────────────────────────────

/**
 * Renderiza un mensaje en el panel de peticiones del locutor.
 * Los mensajes de oyentes tienen botones de "Marcar" y "Completado".
 */
function renderizarPeticion(msg, esHistorial = false) {
  // Mensajes de sistema: barra simple centrada
  if (msg.tipo === "sistema") {
    const div = document.createElement("div");
    div.className = "pet-sistema-msg";
    div.textContent = msg.texto;
    peticionesContainer.appendChild(div);
    if (!esHistorial) scrollAlFinal();
    return;
  }

  const esLoc = msg.tipo === "locutor";

  // Contenedor principal
  const card = document.createElement("div");
  card.className = `peticion-card tipo-${msg.tipo}`;
  card.dataset.id = msg.id || "";

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = `pet-avatar${esLoc ? " av-locutor" : ""}`;
  avatar.textContent = iniciales(msg.apodo);

  // Cuerpo
  const body = document.createElement("div");
  body.className = "pet-body";

  const meta = document.createElement("div");
  meta.className = "pet-meta";

  const apodoEl = document.createElement("span");
  apodoEl.className = `pet-apodo${esLoc ? " ap-locutor" : ""}`;
  apodoEl.textContent = esLoc ? `🎙️ ${msg.apodo}` : msg.apodo;

  const horaEl = document.createElement("span");
  horaEl.className = "pet-hora";
  horaEl.textContent = formatearHora(msg.timestamp);

  meta.appendChild(apodoEl);
  meta.appendChild(horaEl);

  const textoEl = document.createElement("p");
  textoEl.className = "pet-texto";
  textoEl.textContent = msg.texto;

  body.appendChild(meta);
  body.appendChild(textoEl);

  card.appendChild(avatar);
  card.appendChild(body);

  // Solo los mensajes de oyentes tienen botones de gestión
  if (!esLoc) {
    const actions = document.createElement("div");
    actions.className = "pet-actions";

    const btnComp = document.createElement("button");
    btnComp.className = "btn-marcar";
    btnComp.textContent = "✅ Listo";
    btnComp.title = "Marcar como completado";
    btnComp.addEventListener("click", () => marcarCompletado(card, msg.id, btnComp));

    actions.appendChild(btnComp);
    card.appendChild(actions);
  }

  // Guarda referencia para actualizarla si llega señal del servidor
  if (msg.id) mensajesMap.set(msg.id, { card, completado: false });

  peticionesContainer.appendChild(card);

  // Aplica el filtro actual
  aplicarFiltroACard(card);

  if (!esHistorial) scrollAlFinal();
}

function marcarCompletado(card, id, btn) {
  card.classList.add("completado");
  btn.textContent = "✔ Completado";
  btn.classList.add("completado-btn");
  btn.disabled = true;

  if (id) {
    socket.emit("marcarCompletado", { id });
    mensajesMap.get(id) && (mensajesMap.get(id).completado = true);
  }
}


filtrosBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filtrosBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filtroActual = btn.dataset.filtro;
    aplicarFiltroGlobal();
  });
});

function aplicarFiltroACard(card) {
  const esComp = card.classList.contains("completado");
  const esSistema = card.classList.contains("pet-sistema-msg");

  if (esSistema) { card.style.display = ""; return; }

  if (filtroActual === "todos")       card.style.display = "";
  else if (filtroActual === "pendientes")   card.style.display = esComp ? "none" : "";
  else if (filtroActual === "completados")  card.style.display = esComp ? "" : "none";
}

function aplicarFiltroGlobal() {
  peticionesContainer.querySelectorAll(".peticion-card, .pet-sistema-msg")
    .forEach(aplicarFiltroACard);
}



socket.on("bienvenida", (data) => {
  oyentesCount.textContent = data.oyentesCount;
  // Sincroniza toggle con estado real
  toggleEnVivo.checked = data.estadoRadio?.enVivo ?? true;
});

socket.on("historialChat", (historial) => {
  historial.forEach((msg) => renderizarPeticion(msg, true));
  scrollAlFinal();
});

socket.on("nuevoMensaje", (msg) => {
  renderizarPeticion(msg);
});

socket.on("mensajeSistema", (msg) => {
  renderizarPeticion(msg);
});

socket.on("actualizarOyentes", (data) => {
  oyentesCount.textContent = data.count;
});


socket.on("peticionCompletada", (data) => {
  const ref = mensajesMap.get(data.id);
  if (ref && !ref.completado) {
    ref.card.classList.add("completado");
    ref.completado = true;
    const btn = ref.card.querySelector(".btn-marcar");
    if (btn) {
      btn.textContent = "✔ Completado";
      btn.classList.add("completado-btn");
      btn.disabled = true;
    }
    aplicarFiltroACard(ref.card);
  }
});
