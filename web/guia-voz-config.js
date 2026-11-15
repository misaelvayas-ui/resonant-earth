/* Rocola de la Tierra — configuración de la guía por voz.

   servicioIA: la dirección del servicio de IA (carpeta servicio-ia/, ver servicio-ia/LEEME.md), por ejemplo
       "https://rocola-guia-ia.TU-CUENTA.workers.dev"
   Vacío ("") = sin IA: la guía funciona solo con sus comandos, como siempre, y no envía nada a ningún lado.

   AQUÍ NUNCA VA UNA CLAVE. Este archivo es público: cualquiera que abra la página puede leerlo.
   La clave del modelo vive solo en el servicio, guardada como secreto. */
window.GUIA_VOZ_CONFIG = {
  servicioIA: "",
};
