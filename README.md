# GDM Login Customizer

A GNOME Shell 50 extension that customizes both the GDM login screen and the user session with a moon-phase widget, live clock, animated weather, and a power-off button to replace the top-bar on the login-screen.

Created and tested on Ubuntu 26.04 LTS, Gnome 50, Wayland.

Scroll all the way down for screenshots.

## Important notes
- **Internet connection** To be able to fetch the weather before you log in: make sure that you share your internet connection with all users.
Go to: Settings -> WiFi -> Network options
Make sure connect automatically & make available to all users are switched on.
- **Custom background** A custom background is not included. See the instructions below on how to set a custom background.
- **Custom welcome message** The "Welcome back!" message on my screenshot originates from a different extension called GDM Settings, which I haven't deleted yet. I might add a custom welcome message for the login-screen in the future.
- **Updating** Please note that updates are not handled gracefully yet. An updater will be added soon. Settings made through the GUI will be kept. I will add more options and themes in the future. See for more information on how to update below.

## Features

### Login Screen (GDM)
- **Moon-phase widget** — draws an accurate phase shadow over your moon image based on today's date
- **Clock** — large bold time (HH:MM) with date (DD-MM-YYYY) below it
- **Weather widget** — animated meteocons icon + current temperature + 12-period forecast with wind direction and Beaufort scale
- **Power-off button** — upper-right corner with confirmation dialog (optional, replaces the top bar)
- **Top bar hiding** — opt-in via install prompt

### User Session (after login)
- **Weather button in topbar** — shows live weather icon + temperature, auto-updates every 30 minutes
- **Slide-down weather panel** — click the button to reveal a full weather widget with forecast, settings gear, and smooth slide animation
- **Settings modal** — change accent color, forecast time slots, and city without reinstalling

## Installation

```bash
git clone https://github.com/samantha-agi/gnome-weather-widget.git
cd gnome-weather-widget/src
bash install.sh
```

The installer will prompt for:
1. **Hemisphere** — Northern or Southern (affects moon phase rendering)
2. **City** — validated against wttr.in before accepting
3. **Top bar vs power-off button** — keep GNOME's top bar or replace with a power-off button
4. **Accent color** — Green, Blue, Red, Yellow, White, or Pink (default)

After installation, **sign out** to activate the extension on the login screen. Sign back in to see the weather button in your topbar.

## Uninstallation

```bash
bash uninstall.sh
```

Removes the extension, settings directory (`/etc/gdm-login-custom/`), and dconf keyfile. Sign out and back in to apply.

## Settings

Click the **gear icon** in the weather panel (topbar → Weather button → gear) to open the settings modal:

- **Color** — hex color (e.g. `#f56691`), changes all accent colors instantly
- **Time slots** — number of forecast periods (1–24)
- **City** — validated against wttr.in on save; invalid cities get a red border

Settings are stored in `/etc/gdm-login-custom/settings.json` and take effect immediately (no restart needed).

## Updates
For now, if this repo gets an update, you can only update using `git pull` and `bash install.sh`.
This will change. I will add an updater soon.
It's possible that you get github conflicts because of changed files in the repo.
```bash
git stash
git pull
git stash drop
```

## Configuration Files

| File | Location | Purpose |
|---|---|---|
| `config.js` | Extension directory | Static config (city, hemisphere, topbar choice, accent color) — patched by install.sh |
| `settings.json` | `/etc/gdm-login-custom/` | Runtime settings (accent color, forecast slots, city) — written by settings modal |
| `theme.css` | `/etc/gdm-login-custom/` | Generated color CSS — regenerated on settings change |
| `arrow.svg` | `/etc/gdm-login-custom/` | Wind direction arrow with accent color |
| `spinner.svg` | `/etc/gdm-login-custom/` | Loading spinner with accent color |
| `stylesheet.css` | Extension directory | Structural CSS (layout, fonts, sizes) — no colors |

## Weather Icons

The extension uses [meteocons](https://github.com/basmilius/meteocons) animated SVG icons. Each icon is split into per-element layers (via `scripts/split_meteocons_svg.py`) and animated with a 60 FPS GLib timeout loop that drives Clutter actor properties directly.

- **36 animated icons** in `weather-icons/animated/<slug>/` (current weather)
- **36 static icons** in `weather-icons/static/<slug>.svg` (forecast)
- **1 wind arrow** in `weather-icons/wind/arrow.svg` (rotated per forecast entry)

See `svg-converter.md` for the full pipeline documentation.

## File Structure

```
gdm-login-custom@mydomain/
├── extension.js          — main entry point, branches on session mode (GDM vs user)
├── config.js             — static configuration constants
├── weatherCodes.js       — WMO weather code → meteocons icon slug mapping
├── moonPhase.js          — moon-phase math
├── moonPhaseWidget.js    — St.DrawingArea widget for moon.png + phase shadow
├── animatedIcon.js       — multi-layer animated SVG icon (60 FPS manual loop)
├── weatherWidget.js      — current weather + forecast widget
├── weatherPanel.js       — topbar weather button + slide-down panel
├── loadingWidget.js      — animated loading spinner (shown while waiting for network)
├── settings.js           — load/save settings, generate theme.css + SVGs
├── settingsModal.js      — settings dialog (color, slots, city)
├── confirmDialog.js      — power-off confirmation dialog
├── powerButton.js        — power-off button with confirmation
├── stylesheet.css        — structural CSS (no colors)
├── theme.css             — generated color CSS (in /etc/gdm-login-custom/)
├── metadata.json         — GNOME Shell extension metadata
├── moon.png              — user-supplied moon image
└── weather-icons/
    ├── animated/         — 36 split meteocons icon folders
    ├── static/           — 36 static meteocons SVGs
    └── wind/             — wind direction arrow SVG
```

## Requirements

- GNOME Shell 50 (Ubuntu 26.04 LTS or equivalent)
- Wayland (X11 is not supported in GNOME 50)
- `dconf-cli` for the dconf database
- Internet connection for weather data (wttr.in)

## How It Works

### Session Modes

The extension runs in both `gdm` and `user` session modes (declared in `metadata.json`). On `enable()`, it checks `Main.sessionMode.currentMode`:
- **`gdm`** — builds the login screen UI (moon, clock, weather, power button)
- **Any other mode** (e.g. `ubuntu`, `user`) — adds the weather button to the topbar

### Weather Data

Weather is fetched from [wttr.in](https://wttr.in) JSON API (`?format=j1`). The extension uses `Gio.NetworkMonitor` to detect when the network comes up on boot, so weather loads automatically once connectivity is available — no retry timers.

### Animation

Meteocons SVGs contain CSS/SMIL animations that librsvg can't play. Instead, each SVG is split into per-element layers (one SVG + JSON sidecar per animated element). At runtime, the `AnimatedIcon` class loads each layer as a separate `St.Icon` and drives a 60 FPS `GLib.timeout` loop that computes the current animation frame from the keyTimes/values arrays and calls Clutter actor setters directly (`set_position`, `set_opacity`, `set_rotation_angle`).

### Theme System

Colors are separated from structure:
- `stylesheet.css` — layout, fonts, sizes, padding (no color properties)
- `theme.css` — all color properties, generated from the user's accent color

When the user changes the accent color in the settings modal, `saveSettings()` regenerates `theme.css`, `arrow.svg`, and `spinner.svg` with the new color, then reloads the theme stylesheet for an instant color change.

## License

MIT-style. Bundled weather icons are MIT-licensed ([meteocons](https://github.com/basmilius/meteocons)). The wind direction arrow SVG is based on a design by the user.

# Custom background for login-screen

It's highly recommended to make sure that your custom login-screen has the same resolution as your monitor. Setting a background size in the `.xml` is not possible. It will always return to default and you would need to force it (which I'm not going to explain → Just use the same resolution as your monitor 😁).

## Advised storage location

Save your custom login-screen here:

```bash
cp /path/yourfile.jpg /usr/share/backgrounds/login-screen.jpg
```

## Edit the XML

```bash
sudo nano /usr/share/glib-2.0/schemas/com.ubuntu.login-screen.gschema.xml
```

```xml
<schema id="com.ubuntu.login-screen" path="/com/ubuntu/login-screen/">
    <key name="background-picture-uri" type="s">
        <default>'/usr/share/backgrounds/login-screen.jpg'</default>
    </key>
</schema>
```

# Screenshots

I'm not running a VM so I can't make screenshots without using a camera if I'm not signed in.

##July 16th 2026: Improved moon [update: b568ebbed728ccac0673b6f92c3c6b6bb874967e]

Improved drawing of the moon. Better crescent. Currently at 6%, day 3 after new moon.

![Screenshot: new moon](/assets/screen04.jpg)

## Waiting for network connection

The date & time are local and so is the calculation of the moon phase. The current weather & forecast will load as soon as you are fully connected to a network. 

![Screenshot: waiting for network connection](/assets/screen01.jpg)

## The login screen

The login screen with the weather widget fully loaded.

![Screenshot: login screen with widget](/assets/screen02.jpg)

## The widget on the topbar

Unfolded. The topbar only shows a 16x16px icon + degrees (one theme color, pick `#ffffff` if you don't like colors). When you click on it, you see this:

![Screenshot: widget when logged in](/assets/screen03.png)
