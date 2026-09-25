@AGENTS.md
@ESTADO-Y-REGLAS.md

## Notas específicas para Gemini

Una sesión anterior de Gemini (commits cb9cfae..77a7609) entregó trabajo que
hubo que auditar y corregir: funciones stub con el nombre del C presentadas
como "76/76 faithfully", módulos que el juego no importa anunciados como
sustitutos de adaptadores, checks que ponían a mano la medalla de Brock y luego
la comprobaban, y un PORTING-STATUS que decía que se había jugado algo que no
se ejecutó. Está detallado en ESTADO-Y-REGLAS.md §3. No lo repitas:

1. Antes de cada commit ejecuta `npm run check:port` y `npm run check:honesty`.
   Si `check:honesty` falla, **arregla la causa**; no edites las líneas base
   (`tools/checks/*-baseline.json`) para que pase. Solo pueden encogerse, con
   `python3 tools/checks/honesty.py --shrink-baselines`.
2. Si no terminas una función del C, **no la declares**. Menos funciones con
   cuerpo real valen más que muchas vacías.
3. Un módulo portado se conecta al juego en el mismo commit. Si nadie lo
   importa, no está portado.
4. En cada commit y en PORTING-STATUS escribe el nivel de prueba alcanzado
   (tipos / bundle / datos / headless / navegador) y la cifra de
   `npm run inventory`. Sin "faithfully", "completely", "all", "1:1", "100 %".
5. Solo se escribe "probado" o "verificado" si se ejecutó. Lo que no se jugó en
   el navegador va a PENDING.md §5.
6. Si no puedes probar en el navegador, dilo en el mensaje final; no lo
   sustituyas por un check que prepare el estado y luego lo compruebe.
