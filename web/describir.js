/*
 * describir(rasgo, contexto) -> texto en español simple de lo que muestra el video en ese momento.
 *
 * Está sola en este archivo para poder reemplazarla luego (por ejemplo, por una IA).
 * Debe devolver un string (o una Promise<string>: app.js acepta ambas).
 *
 * rasgo:    { fecha?, media, area, centroide_x, ... }   (un registro de rasgos.json)
 * contexto: { unidad, vmin, vmax, referencia }          (referencia = valor del tono grave fijo)
 */
function describir(rasgo, contexto = {}) {
  const unidad = contexto.unidad ? " " + contexto.unidad : "";
  const num = (x) => x.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const partes = [];

  if (rasgo.fecha != null) partes.push(`Año ${rasgo.fecha}.`);

  if (rasgo.media != null) {
    const nombre = contexto.unidad === "°C" ? "Temperatura media" : "Valor medio";
    let frase = `${nombre}: ${num(rasgo.media)}${unidad}`;
    if (contexto.vmin != null && contexto.vmax != null && !contexto.unidad) {
      frase += ` (en una escala de ${num(contexto.vmin)} a ${num(contexto.vmax)})`;
    }
    if (contexto.referencia != null) {
      const dif = rasgo.media - contexto.referencia;
      if (Math.abs(dif) < 0.005) frase += ", igual a la referencia";
      else frase += `, ${num(Math.abs(dif))}${unidad} ${dif > 0 ? "por encima" : "por debajo"} de la referencia`;
    }
    partes.push(frase + ".");
  }

  if (rasgo.area != null) {
    const pct = Math.round(rasgo.area * 100);
    if (rasgo.area < 0.01) {
      partes.push("Casi no hay zona caliente.");
    } else {
      let lugar = "";
      if (rasgo.centroide_x != null) {
        if (rasgo.centroide_x < 0.4) lugar = ", sobre todo a la izquierda del mapa";
        else if (rasgo.centroide_x > 0.6) lugar = ", sobre todo a la derecha del mapa";
        else lugar = ", sobre todo en el centro del mapa";
      }
      partes.push(`La zona caliente cubre ${pct < 1 ? "menos del 1" : "el " + pct} % del mapa${lugar}.`);
    }
  }

  return partes.join(" ");
}
