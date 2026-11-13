
// Elementos de la interfaz
const formulario = document.getElementById("formulario");
const entrada = document.getElementById("entrada");
const botonEnviar = document.getElementById("boton-enviar");
const mensajes = document.getElementById("mensajes");

// Configuración
const TIEMPO_LIMITE = 30000;
const PAUSA_MINIMA = 1500;
const MAX_CARACTERES = 500;

// Identificador de sesión
let sessionId = crearSessionId();
let ultimoEnvio = 0;

// Genera o recupera una sesión
function crearSessionId() {
    try {
        let guardado = localStorage.getItem("peluqueria_session");

        if (guardado) {
            return guardado;
        }
    } catch (error) {
        console.warn("No se pudo acceder al almacenamiento.");
    }

    const nuevoId = generarId();

    try {
        localStorage.setItem("peluqueria_session", nuevoId);
    } catch (error) {
        console.warn("Se utilizará la sesión en memoria.");
    }

    return nuevoId;
}

// Genera un identificador único
function generarId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return Date.now() + "-" + Math.random().toString(36).slice(2);
}

// Espera una cantidad de tiempo
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Agrega un mensaje al chat usando textContent
function agregarMensaje(texto, tipo) {
    const contenedor = document.createElement("div");
    contenedor.className = `mensaje ${tipo}`;

    const burbuja = document.createElement("div");
    burbuja.className = "burbuja";
    burbuja.textContent = texto;

    const hora = document.createElement("span");
    hora.className = "hora";
    hora.textContent = tipo === "usuario"
        ? "Vos"
        : "Asistente virtual";

    contenedor.appendChild(burbuja);
    contenedor.appendChild(hora);

    mensajes.appendChild(contenedor);
    mensajes.scrollTop = mensajes.scrollHeight;

    return contenedor;
}

// Activa o desactiva los controles
function cambiarEstado(cargando) {
    entrada.disabled = cargando;
    botonEnviar.disabled = cargando;

    botonEnviar.textContent = cargando ? "Enviando..." : "Enviar ➤";
}

// Procesa la respuesta de Make
function interpretarRespuesta(texto) {
    if (!texto.trim()) {
        return "(respuesta vacía)";
    }

    try {
        const datos = JSON.parse(texto);

        if (
            datos &&
            typeof datos === "object" &&
            !Array.isArray(datos)
        ) {
            const propiedades = [
                "response",
                "respuesta",
                "message",
                "mensaje"
            ];

            for (const propiedad of propiedades) {
                if (
                    typeof datos[propiedad] === "string" &&
                    datos[propiedad].trim() !== ""
                ) {
                    return datos[propiedad];
                }
            }

            return "Make respondió, pero sin el campo response";
        }

        return "Make respondió, pero sin el campo response";

    } catch (error) {
        // Si no es JSON válido, mostrar el texto original
        return texto;
    }
}

// Envía el mensaje al webhook
async function enviarMensaje(mensaje) {

    // Verifica la URL configurada
    if (
        typeof WEBHOOK_URL !== "string" ||
        !WEBHOOK_URL.trim() ||
        WEBHOOK_URL.includes("ACA VA")
    ) {
        agregarMensaje(
            "Falta pegar la URL de tu webhook en config.js",
            "agente"
        );
        return;
    }

    cambiarEstado(true);

    const indicador = agregarMensaje("Escribiendo...", "agente");
    indicador.classList.add("cargando");

    let controlador;

    try {
        // Respeta la pausa mínima entre envíos
        const tiempoRestante =
            PAUSA_MINIMA - (Date.now() - ultimoEnvio);

        if (tiempoRestante > 0) {
            await esperar(tiempoRestante);
        }

        // Registra el momento del envío
        ultimoEnvio = Date.now();

        // Prepara el límite de tiempo
        controlador = new AbortController();

        const temporizador = setTimeout(() => {
            controlador.abort();
        }, TIEMPO_LIMITE);

        try {
            // Datos enviados a Make: exactamente tres campos
            const datos = {
                sessionId: sessionId,
                mensaje: mensaje,
                fecha: new Date().toISOString()
            };

            const respuesta = await fetch(WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos),
                signal: controlador.signal
            });

            // Lee la respuesta del servidor
            const texto = await respuesta.text();

            if (!respuesta.ok) {
                throw new Error(
                    `HTTP:${respuesta.status}`
                );
            }

            const respuestaAgente = interpretarRespuesta(texto);

            indicador.querySelector(".burbuja").textContent =
                respuestaAgente;

            indicador.classList.remove("cargando");

        } finally {
            clearTimeout(temporizador);
        }

    } catch (error) {

        let mensajeError;

        if (error.name === "AbortError") {
            mensajeError = "La solicitud tardó demasiado. Intentá nuevamente.";
        } else if (error.message.startsWith("HTTP:")) {
            const codigo = error.message.split(":")[1];

            mensajeError =
                `Make respondió con error (código ${codigo}). ` +
                "Revisá que tu escenario esté en Active o que hayas apretado Run once.";
        } else {
            mensajeError =
                "No se pudo conectar con el servidor. Revisá tu conexión y la URL del webhook.";
        }

        indicador.querySelector(".burbuja").textContent =
            mensajeError;

        indicador.classList.remove("cargando");

        console.error("Error al enviar:", error);

    } finally {
        // Siempre recupera los controles
        cambiarEstado(false);
        entrada.focus();
        mensajes.scrollTop = mensajes.scrollHeight;
    }
}

// Evento de envío del formulario
formulario.addEventListener("submit", async function(evento) {
    evento.preventDefault();

    const mensaje = entrada.value.trim();

    if (!mensaje) {
        return;
    }

    // Validación de longitud
    if (mensaje.length > MAX_CARACTERES) {
        agregarMensaje(
            "El mensaje no puede superar los 500 caracteres.",
            "agente"
        );
        return;
    }

    // Muestra el mensaje del cliente
    agregarMensaje(mensaje, "usuario");

    entrada.value = "";

    await enviarMensaje(mensaje);
});
