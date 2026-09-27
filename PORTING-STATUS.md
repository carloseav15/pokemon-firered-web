# Estado operativo del port

Modo: **portado e integración por tandas; revisión funcional exhaustiva posterior**.
Alcance: FireRed completo, incluidos contenido opcional, enlace y minijuegos.
Reglas: [AGENTS.md](AGENTS.md). Cifras vivas: [PENDING.md](PENDING.md) y
[PORT-INVENTORY.md](PORT-INVENTORY.md); son cobertura de nombres, no fidelidad.

## Siguiente tanda

Priorizar un grupo de comportamiento faltante en `event_object_movement.c`,
conectado a `src/fr/field/objectEvents.ts` y sus consumidores. Consultar cuerpos
C y equivalencias TS antes de elegir; las funciones de tablas, congelación,
elevación y colisión ya trabajadas no deben contarse otra vez como novedades.
Si las dependencias bloquean el grupo, resolver la dependencia o seleccionar
otro conjunto conectado desde PENDING.md. No retomar automáticamente getters
aislados de naming solo por su tamaño.

## Bloqueos y validación diferida

- No hay una auditoría funcional completa del juego. La evidencia histórica de
  recorrido llega hasta Monte Moon; continuar mediante [PLAN-RECORRIDO.md](PLAN-RECORRIDO.md)
  en la fase de revisión. No interpretar esto como certificación del checkout actual.
- Mantener visibles stubs, módulos desconectados, cajas del PC y Teachy TV según
  PENDING.md. Suprimir una etiqueta no sustituye implementar sus comportamientos.
- Naming: hubo un render negro durante una prueba de cambio de página; una prueba
  posterior vio SELECT cambiar mayúsculas/minúsculas, pero falta verificar salida
  completa y resolver si el síntoma anterior persiste.
- Campo: el selector de subsprites se conserva, pero Canvas2D no compone sus piezas
  como el renderer GBA. La paridad visual queda pendiente.
- Las demás comprobaciones diferidas figuran en PENDING.md y en el historial.
  Añadir aquí una línea por sistema nuevo sin validar si la lista generada no lo cubre;
  conservarla hasta su revisión, aunque cambie el resumen de la última entrega.

## Última entrega

- 2026-09-27: proceso unificado en AGENTS.md, tandas amplias y checks por cierre.
- Guía técnica separada; historial archivado; prompts de agentes alineados.
- Sin cambios al código del juego ni al cálculo de cobertura en esta entrega.
- Validación: coherencia documental, enlaces locales, diff y check:honesty.

## Antecedentes bajo demanda

[Historial hasta 2026-09-27](docs/archive/PORTING-STATUS-2026-09-27.md).
Consultar solo para un síntoma, sistema o commit concreto; no leerlo entero al arrancar.
