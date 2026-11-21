/** Rutas conocidas del banco: respaldo cuando /openapi.json no está disponible. */
import type { ApiRoute } from "./source";

const LAB = "laboratorio";
const ZKP = "ZKP · Schnorr";
const TELEMETRY = "observabilidad";
const SUPPORT = "soporte";

export const FALLBACK_ROUTES: readonly ApiRoute[] = [
  { method: "GET", path: "/zkp/params", summary: "Parámetros públicos (p, q, g)", tag: ZKP },
  { method: "POST", path: "/zkp/register", summary: "Crear cuenta: enviar y", tag: ZKP },
  { method: "POST", path: "/zkp/login/commit", summary: "Paso 1: enviar el compromiso t y recibir el reto c", tag: ZKP },
  { method: "POST", path: "/zkp/login/respond", summary: "Paso 2: enviar la respuesta s y recibir la decisión", tag: ZKP },
  { method: "POST", path: "/zkp/login/nizk", summary: "Inicio de sesión no interactivo (Fiat-Shamir): t, s y m", tag: ZKP },
  { method: "GET", path: "/mechanisms", summary: "Mecanismos de autenticación disponibles", tag: LAB },
  { method: "GET", path: "/bank/users", summary: "Lo que guarda el banco de cada usuario, por mecanismo", tag: LAB },
  { method: "GET", path: "/bank/accounts", summary: "Cuentas con su estado e intentos restantes", tag: LAB },
  { method: "GET", path: "/audit/log", summary: "Todos los cuerpos recibidos, en orden", tag: LAB },
  { method: "GET", path: "/events", summary: "Eventos del banco desde un identificador", tag: LAB },
  { method: "GET", path: "/events/stream", summary: "Eventos del banco en tiempo real (Server-Sent Events)", tag: LAB },
  { method: "GET", path: "/telemetry/summary", summary: "Resumen de la ventana: series, latencia y rutas", tag: TELEMETRY },
  { method: "GET", path: "/telemetry/requests", summary: "Peticiones recibidas con sus cuerpos", tag: TELEMETRY },
  { method: "GET", path: "/telemetry/requests/{request_id}", summary: "Una petición con todo lo que hizo el banco", tag: TELEMETRY },
  { method: "GET", path: "/telemetry/alerts", summary: "Alertas deducidas de las peticiones", tag: TELEMETRY },
  { method: "GET", path: "/lab/tests", summary: "Resultado de las pruebas por requerimiento", tag: LAB },
  { method: "POST", path: "/admin/accounts/{mechanism}/{user_id}/unlock", summary: "Desbloquear una cuenta", tag: SUPPORT },
  { method: "DELETE", path: "/admin/accounts/{mechanism}/{user_id}", summary: "Dar de baja una cuenta", tag: SUPPORT },
];
