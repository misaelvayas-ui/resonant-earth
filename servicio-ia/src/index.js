/* Rocola de la Tierra — servicio de la guía por voz con IA: entrada para Cloudflare Workers.

   Toda la lógica está en nucleo.js (se prueba con Node). Aquí solo está lo propio de Cloudflare:
   - el Worker, que recibe la petición;
   - el contador (un Durable Object con SQLite, disponible en el plan gratuito): una sola instancia para todo
     el servicio, así los límites por minuto y por día son exactos y el tope diario sobrevive a los reinicios. */
import { DurableObject } from "cloudflare:workers";
import { Limites, config, limitesVoz, manejar } from "./nucleo.js";

export class Contador extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.limites = new Limites();
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS uso (dia TEXT PRIMARY KEY, n INTEGER NOT NULL)");
  }

  /* ¿Puede pasar esta petición? Devuelve { ok } o { ok: false, motivo, reintentar }.
     tipo "voz" = la instancia que cuenta las peticiones de voz, con sus propios límites (más bajos). */
  async permitir(visitante, tipo = "") {
    const ahora = Date.now();
    const dia = new Date(ahora).toISOString().slice(0, 10);              // el día cambia a medianoche UTC
    if (this.limites.dia !== dia) {
      const fila = this.ctx.storage.sql.exec("SELECT COALESCE((SELECT n FROM uso WHERE dia = ?), 0) AS n", dia).one();
      this.limites.iniciarDia(dia, Number(fila.n) || 0);
      this.ctx.storage.sql.exec("DELETE FROM uso WHERE dia <> ?", dia);
    }
    const cfg = config(this.env);
    const r = this.limites.permitir(String(visitante).slice(0, 80), ahora, tipo === "voz" ? limitesVoz(cfg) : cfg);
    if (r.ok) {
      this.ctx.storage.sql.exec("INSERT INTO uso (dia, n) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET n = excluded.n", dia, this.limites.usadasHoy);
    }
    return r;
  }

  /* El modelo dijo "límite": no insistir durante un rato. */
  async enfriar(segundos) {
    this.limites.enfriar(Date.now(), Number(segundos) || 60);
  }
}

export default {
  async fetch(request, env) {
    try {
      const voz = env.CONTADOR.getByName("voz");                          // otra instancia del contador: la voz no le quita cupo a la conversación
      return await manejar(request, env, { contador: env.CONTADOR.getByName("global"),
        contadorVoz: { permitir: (visitante) => voz.permitir(visitante, "voz"), enfriar: (segundos) => voz.enfriar(segundos) } });
    } catch (e) {
      // sin detalles hacia fuera: la web solo necesita saber que debe usar sus comandos de siempre
      return new Response(JSON.stringify({ error: "servicio" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
  },
};
