# Entwirren – das Kabelsalat-Puzzle

Untangle-/Tangle-Klon in 3D: farbige Schläuche stecken in einem Holzbrett und liegen kreuz und quer übereinander.
Stecker umstecken, bis sich kein Schlauch mehr kreuzt – mit möglichst wenigen Zügen.

**Live:** https://mac-fa.github.io/entwirren/

Lokal starten: `node node_modules/http-server/bin/http-server Untangle -p 8120 -c-1` (aus dem Elternordner) bzw. Launch-Konfiguration `untangle`. three.js (MIT) liegt unverändert in `lib/`.

## Regeln
- Ein Zug = einen Stecker in ein freies Loch stecken (ziehen oder antippen → Loch antippen).
- Verheddert ist ein Schlauch, wenn er einen anderen kreuzt, über einen fremden Stecker oder über eine Säule läuft.
- Ein angehobener Schlauch landet obenauf (Lagenreihenfolge).
- Festgeschraubte Stecker (Stahlkappe + Schrauben) bewegen sich nicht.
- **Optimum** = minimale Zugzahl, vom Solver exakt berechnet → 3 Sterne; ≤ Optimum+2 → 2 Sterne.

## Technik
- `js/logic.js` – Geometrie, Konfliktregeln, **IDA\*-Solver** (Heuristik: minimale Knotenüberdeckung des Konfliktgraphen –
  zulässig und konsistent, weil jeder Konflikt nur durch Bewegen eines der beiden Schläuche verschwindet), Levelgenerator.
  Läuft im Browser, im Worker und in Node.
- `js/rope.js` – Schlauchphysik: Grundriss folgt exakt der logischen Geraden (Topologie = Spiellogik), Höhe per Verlet mit
  Längenbegrenzung, Biegesteifigkeit, Brett-, Stecker-, Säulen- und Schlauchkontakten in Lagenreihenfolge; dazu
  gedämpftes Nachschwingen im Grundriss. Röhrengeometrie mit Paralleltransport-Rahmen, gerippte Oberfläche per Bump-Map.
- `js/scene.js` – three.js r170 (lokal in `lib/`): Holzbrett als Extrusion mit echten Bohrungen, prozedurale Texturen,
  eigene PMREM-Umgebung für Spiegelungen, weiche Schatten, ACES-Tonemapping, Kamera passt sich Hoch-/Querformat an.
- `js/main.js` – Spielablauf, Eingabe (Ziehen + Antippen), Rückgängig, Tipp (optimaler nächster Zug im Worker), Sterne, Fortschritt (localStorage).
- `js/worker.js` – Tipp-Solver und Zufallsrätsel im Hintergrund.

## Level
`js/levels.js` ist generiert: `node tools/gen-levels.js` (60 Level, Kapitel Grundlagen / Säulen / Festgeschraubt /
Enger Platz / Meister), danach `node tools/gen-tail.js` (handgebautes Level 1 + Schlusslevel).
`node tools/verify.js` prüft den Solver per Breitensuche gegen.
