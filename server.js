const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});


const ADJETIVOS = [
  "Alegre", "Veloz", "Curioso", "Valiente", "Brillante",
  "Salvaje", "Tranquilo", "Audaz", "Sereno", "Feroz",
  "Amable", "Astuto", "Gentil", "Mágico", "Libre"
];

const ANIMALES = [
  "Lobo", "Gato", "Aguila", "Zorro", "Puma",
  "Delfin", "Tigre", "Cuervo", "Oso", "Jaguar",
  "Halcon", "Lince", "Nutria", "Panda", "Koala"
];


function generarApodo() {
  const adj = ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)];
  const ani = ANIMALES[Math.floor(Math.random() * ANIMALES.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4 dígitos
  return `${adj}_${ani}_${num}`;
}

// ─── Estado global de la radio ──────────────────────────────────────────────
let estadoRadio = {
  enVivo: true,
  programaActual: "Programa de la Tarde",
  cancionActual: "En Vivo",
  artista: "",
  caratula: "/img/logo.jpg",
  streamUrl: "",  // URL del stream de audio (configurable por el locutor)
  youtubeUrl: ""  // URL de YouTube activa
};

// Registro de oyentes conectados: { socketId -> { apodo, esLocutor } }
const oyentesConectados = new Map();

// Historial de chat (últimos 50 mensajes para nuevos entrantes)
const historialChat = [];
const MAX_HISTORIAL = 50;

// ─── Archivos estáticos ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Ruta principal — Panel del oyente
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Ruta del locutor — Panel de control
app.get("/locutor", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "locutor.html"));
});

// API: estado actual de la radio (para clientes que reconectan)
app.get("/api/estado", (req, res) => {
  res.json({
    ...estadoRadio,
    oyentesCount: oyentesConectados.size
  });
});

// ─── Lógica Socket.io ───────────────────────────────────────────────────────
io.on("connection", (socket) => {

  // Determina si es el locutor por query param: /locutor?locutor=true
  const esLocutor = socket.handshake.query.rol === "locutor";
  const apodo = esLocutor ? "Locutor" : generarApodo();

  // Guarda en el mapa de conexiones
  oyentesConectados.set(socket.id, { apodo, esLocutor });

  console.log(`[+] Conectado: ${apodo} (${esLocutor ? "LOCUTOR" : "oyente"}) — ID: ${socket.id}`);

  // 1. Envía al nuevo cliente su apodo y el estado actual de la radio
  socket.emit("bienvenida", {
    apodo,
    esLocutor,
    estadoRadio,
    oyentesCount: oyentesConectados.size
  });

  // 2. Envía el historial de chat al nuevo oyente
  socket.emit("historialChat", historialChat);

  // 3. Notifica a todos que alguien se unió (excepto el locutor para no saturar)
  if (!esLocutor) {
    const msgSistema = {
      tipo: "sistema",
      texto: `${apodo} se unió a la radio 🎵`,
      timestamp: new Date().toISOString()
    };
    io.emit("mensajeSistema", msgSistema);
  }

  // 4. Actualiza el contador de oyentes para todos
  io.emit("actualizarOyentes", { count: oyentesConectados.size });

  // 5. Si el locutor ya está al aire con el micrófono, avisa al nuevo oyente
  if (!esLocutor && estadoRadio.vozActiva) {
    socket.emit("voz-inicio");
    // Notifica al locutor que hay un nuevo oyente para que conecte WebRTC
    const locutorSocket = [...oyentesConectados.entries()]
      .find(([, v]) => v.esLocutor);
    if (locutorSocket) {
      io.to(locutorSocket[0]).emit("oyente-conectado-voz", { socketId: socket.id });
    }
  }

  // ── Evento: mensaje de chat enviado por un oyente o el locutor ──
  socket.on("enviarMensaje", (data) => {
    const usuario = oyentesConectados.get(socket.id);
    if (!usuario) return;

    const mensaje = {
      tipo: usuario.esLocutor ? "locutor" : "oyente",
      apodo: usuario.apodo,
      texto: String(data.texto).slice(0, 300), // límite de 300 caracteres
      timestamp: new Date().toISOString(),
      id: `${socket.id}-${Date.now()}`
    };

    // Guardar en historial (circular)
    historialChat.push(mensaje);
    if (historialChat.length > MAX_HISTORIAL) historialChat.shift();

    // Emitir a todos los clientes conectados
    io.emit("nuevoMensaje", mensaje);
    console.log(`[Chat] ${mensaje.apodo}: ${mensaje.texto}`);
  });

  // ── Evento: el locutor actualiza la canción actual ──
  socket.on("actualizarCancion", (data) => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;

    estadoRadio.cancionActual = data.cancion || estadoRadio.cancionActual;
    estadoRadio.artista = data.artista || estadoRadio.artista;
    estadoRadio.caratula = data.caratula || estadoRadio.caratula;
    estadoRadio.programaActual = data.programa || estadoRadio.programaActual;
    estadoRadio.youtubeUrl = data.youtubeUrl || estadoRadio.youtubeUrl;
    estadoRadio.streamUrl = data.streamUrl || estadoRadio.streamUrl;

    // Notificar a todos con la nueva info
    io.emit("cancionActualizada", estadoRadio);

    const msgSistema = {
      tipo: "sistema",
      texto: `🎵 Ahora suena: ${estadoRadio.cancionActual}${estadoRadio.artista ? " — " + estadoRadio.artista : ""}`,
      timestamp: new Date().toISOString()
    };
    io.emit("mensajeSistema", msgSistema);
    console.log(`[Cancion] ${estadoRadio.cancionActual} - ${estadoRadio.artista}`);
  });

  // ── Evento: el locutor cambia el estado EN VIVO ──
  socket.on("toggleEnVivo", (data) => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;
    estadoRadio.enVivo = !!data.enVivo;
    io.emit("estadoEnVivo", { enVivo: estadoRadio.enVivo });
    console.log(`[Radio] Estado EN VIVO: ${estadoRadio.enVivo}`);
  });

  // ── Evento: el locutor marca una petición como completada ──
  socket.on("marcarCompletado", (data) => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;
    io.emit("peticionCompletada", { id: data.id });
  });

  // ── Voz en vivo: el locutor envía chunks de audio via Socket.io ─────────────
  socket.on("voz-chunk", (chunk) => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;
    // Reenvía el chunk de audio a todos los oyentes
    socket.broadcast.emit("voz-chunk", chunk);
  });

  socket.on("voz-inicio", () => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;
    estadoRadio.vozActiva = true;
    console.log("[Voz] Locutor al aire");
    socket.broadcast.emit("voz-inicio");
    io.emit("mensajeSistema", {
      tipo: "sistema",
      texto: "🎙️ El locutor está hablando en vivo",
      timestamp: new Date().toISOString()
    });
  });

  socket.on("voz-fin", () => {
    if (!oyentesConectados.get(socket.id)?.esLocutor) return;
    estadoRadio.vozActiva = false;
    console.log("[Voz] Locutor dejó el aire");
    socket.broadcast.emit("voz-fin");
    io.emit("mensajeSistema", {
      tipo: "sistema",
      texto: "🎵 Volviendo a la música",
      timestamp: new Date().toISOString()
    });
  });

  // ── Desconexión ──
  socket.on("disconnect", () => {
    const usuario = oyentesConectados.get(socket.id);
    if (usuario) {
      oyentesConectados.delete(socket.id);
      console.log(`[-] Desconectado: ${usuario.apodo}`);

      if (!usuario.esLocutor) {
        io.emit("mensajeSistema", {
          tipo: "sistema",
          texto: `${usuario.apodo} salió de la radio`,
          timestamp: new Date().toISOString()
        });
      }
      io.emit("actualizarOyentes", { count: oyentesConectados.size });
    }
  });
});

//   ─── Arrancar servidor ───────  //
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎙️  Radio en Vivo corriendo en: http://localhost:${PORT}`);
  console.log(`🎚️  Panel del Locutor en:        http://localhost:${PORT}/locutor\n`);
});
