# Space Shooter Game

## Run locally

```bash
cd /home/achira363/Programming_Langauge_Testing/JavaScript/SpaceShooterGame
npm install
npm run build
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in a browser while that terminal remains running. Stop the server with `Ctrl+C` when finished.

The first screen is mouse-driven: click Tutorial or Endless. In a run, move with WASD/arrow keys, fire with Space, and use `I` Cryo Sink. The Cryo Sink ejects a drifting cryogenic countermeasure that drains normal enemy bullets and chills nearby enemies before freezing them; enemy beams ignore it. Tutorial explains when `K` Repair, `L` Shield, and `J` Charge Beam unlock.
