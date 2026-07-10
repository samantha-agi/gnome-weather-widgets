#!/usr/bin/env bash
#
# install.sh — install the GDM Login Customizer extension system-wide.
#
# Usage:
#   ./install.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_UUID="gdm-login-custom@mydomain"
SRC_DIR="${SCRIPT_DIR}/${EXT_UUID}"
DEST_DIR="/usr/share/gnome-shell/extensions/${EXT_UUID}"

# dconf keyfile locations for GDM.
DCONF_PROFILE="/etc/dconf/profile/gdm"
DCONF_KEYFILE_DIR="/etc/dconf/db/gdm.d"
DCONF_KEYFILE="${DCONF_KEYFILE_DIR}/01-${EXT_UUID}"

# Check if we're root. If not, re-exec with sudo so the whole
# script (including prompts) runs as root in one pass.
if [[ $EUID -ne 0 ]]; then
    exec sudo bash "$0" "$@"
fi
# --- loader -----------------------------------------------------------------

echo "============================================================"
echo "      _       ___________  ________  ____________" 
echo "     | |     / / ____/   |/_  __/ / / / ____/ __ \ "
echo "     | | /| / / __/ / /| | / / / /_/ / __/ / /_/ /"
echo "     | |/ |/ / /___/ ___ |/ / / __  / /___/ _, _/" 
echo "     |__/|__/_____/_/__|_/_/_/_/_/_/_____/_/_|_|__"
echo "           | |     / /  _/ __ \/ ____/ ____/_  __/"
echo "           | | /| / // // / / / / __/ __/   / /"   
echo "           | |/ |/ // // /_/ / /_/ / /___  / /    "
echo "           |__/|__/___/_____/\____/_____/ /_/"     
echo ""
echo "============================================================"                                          
                                            





# --- sanity checks ----------------------------------------------------------
if [[ ! -d "${SRC_DIR}" ]]; then
    echo "ERROR: source folder not found: ${SRC_DIR}" >&2
    echo "Run this script from the directory that contains the extension folder." >&2
    exit 1
fi

for f in metadata.json extension.js stylesheet.css moon.png config.js; do
    if [[ ! -f "${SRC_DIR}/${f}" ]]; then
        echo "ERROR: missing file ${SRC_DIR}/${f}" >&2
        exit 1
    fi
done

# --- version sanity check ---------------------------------------------------
if ! grep -q "VERSION:" "${SRC_DIR}/extension.js"; then
    echo "ERROR: extension.js has no VERSION marker." >&2
    echo "Re-download from GitHub: https://github.com/samantha-agi/gnome-loginscreen" >&2
    exit 1
fi
INSTALLED_VER=$(grep -m 1 -oP 'VERSION: \K[0-9.]+' "${SRC_DIR}/extension.js" 2>/dev/null || echo "unknown")
echo "==> Source extension.js version: ${INSTALLED_VER}"

# --- interactive prompts ----------------------------------------------------
echo ""  
echo "====================== Configuration ======================="
echo ""

# 0. Hemisphere (for moon phase)
echo "Which hemisphere are you in?"
echo "  1) Northern hemisphere"
echo "  2) Southern hemisphere"
read -r -p "Choice [1/2] (default: 1): " HEMISPHERE_CHOICE
if [[ "${HEMISPHERE_CHOICE}" == "2" ]]; then
    INVERT_MOON_VAL="true"
    echo "  → Southern hemisphere — moon phase will be inverted."
else
    INVERT_MOON_VAL="false"
    echo "  → Northern hemisphere."
fi
echo ""
echo ""
echo ""
# 1. City
while true; do
    read -r -p "Enter your city: " WEATHER_CITY
    if [[ -z "${WEATHER_CITY}" ]]; then
        echo "  Please enter a city."
        continue
    fi
    echo "  Validating '${WEATHER_CITY}' against wttr.in..."
    VALIDATION=$(curl -sL --max-time 10 "https://wttr.in/${WEATHER_CITY// /%20}?format=j1" 2>/dev/null || true)
    if [[ -z "${VALIDATION}" ]]; then
        echo "  ✗ No response from wttr.in. Check your internet connection."
    elif [[ "${VALIDATION}" == *"location not found"* ]] || [[ "${VALIDATION}" == *"upstream error"* ]]; then
        echo "  ✗ City '${WEATHER_CITY}' not found. Please try again."
    elif [[ "${VALIDATION}" == *"current_condition"* ]]; then
        echo "  ✓ Location validated."
        break
    else
        echo "  ✗ Unexpected response from wttr.in. Please try again."
    fi
done

# 2. Topbar vs power-off button
echo ""
echo ""
echo ""
echo "On the login screen, do you want to:"
echo "  1) Keep the GNOME top bar (no power-off button)"
echo "  2) Hide the top bar and show a power-off button instead"
read -r -p "Choice [1/2] (default: 2): " TOPBAR_CHOICE
if [[ "${TOPBAR_CHOICE}" == "1" ]]; then
    HIDE_TOPBAR_VAL="false"
    echo "  → Top bar will stay visible. No power-off button."
else
    HIDE_TOPBAR_VAL="true"
    echo "  → Top bar hidden. Power-off button will be shown."
fi
echo ""
echo ""
echo ""

# 3. Accent color
echo "Pick an accent color:"
echo "  1) Green   (#69ff9b)"
echo "  2) Blue    (#42c0ff)"
echo "  3) Red     (#db2525)"
echo "  4) Yellow  (#dbba25)"
echo "  5) White   (#ffffff)"
echo "  6) Pink    (#f56691) — default"
read -r -p "Choice [1-6] (press Enter for default pink): " COLOR_CHOICE
case "${COLOR_CHOICE}" in
    1) ACCENT_COLOR="#69ff9b" ;;
    2) ACCENT_COLOR="#42c0ff" ;;
    3) ACCENT_COLOR="#db2525" ;;
    4) ACCENT_COLOR="#dbba25" ;;
    5) ACCENT_COLOR="#ffffff" ;;
    *) ACCENT_COLOR="#f56691" ;;
esac
echo "  → Accent color: ${ACCENT_COLOR}"
echo ""
echo ""
echo ""

# --- 0. write config.json to /etc/gdm-login-custom/ -------------------------
echo "==> Writing config to /etc/gdm-login-custom/config.json"
mkdir -p /etc/gdm-login-custom
chmod 777 /etc/gdm-login-custom

python3 - << PYEOF
import json

config = {
    "accentColor": "${ACCENT_COLOR}",
    "forecastHours": 12,
    "location": "${WEATHER_CITY}",
    "hideTopbar": ${HIDE_TOPBAR_VAL^},
    "invertMoon": ${INVERT_MOON_VAL^},
}

with open("/etc/gdm-login-custom/config.json", "w") as f:
    json.dump(config, f, indent=2)

print(f"  Config written: {json.dumps(config)}")
PYEOF

chmod 666 /etc/gdm-login-custom/config.json

# --- 1. copy extension to system location -----------------------------------
echo "==> Installing extension to ${DEST_DIR}"
rm -rf "${DEST_DIR}"
cp -r "${SRC_DIR}" "${DEST_DIR}"
chmod -R 755 "${DEST_DIR}"
chown -R root:root "${DEST_DIR}"

# Generate theme.css, arrow.svg, and spinner.svg with the chosen accent color.
python3 - "${ACCENT_COLOR}" /etc/gdm-login-custom << 'PYEOF'
import sys, re

hex_color = sys.argv[1]
out_dir = sys.argv[2]

m = re.match(r'^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$', hex_color, re.I)
r, g, b = int(m.group(1), 16), int(m.group(2), 16), int(m.group(3), 16)

# Generate theme.css
theme_css = f"""/* GDM Login Customizer — theme (colors only, generated from config) */
/* Accent color: {hex_color} (rgb {r}, {g}, {b}) */

.glc-left-widget {{
    background-color: rgba(0, 0, 0, 0.15);
}}
.glc-clock-time {{
    color: {hex_color};
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
}}
.glc-clock-date {{
    color: {hex_color};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}}
.glc-power-button {{
    background-color: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba({r}, {g}, {b}, 0.35);
    color: {hex_color};
}}
.glc-power-button:hover {{
    background-color: rgba({r}, {g}, {b}, 0.75);
    border: 1px solid rgba({r}, {g}, {b}, 0.85);
    color: #FFFFFF;
}}
.glc-power-button:active {{
    background-color: rgba(140, 20, 20, 0.9);
}}
.glc-confirm-backdrop {{
    background-color: rgba(0, 0, 0, 0.55);
}}
.glc-confirm-dialog {{
    background-color: #1d1d1d;
    border: 1px solid rgba({r}, {g}, {b}, 0.4);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
}}
.glc-confirm-title {{
    color: {hex_color};
}}
.glc-confirm-body {{
    color: #e6e6e6;
}}
.glc-confirm-cancel {{
    background-color: #3a3a3a;
    color: #e6e6e6;
}}
.glc-confirm-cancel:hover {{
    background-color: #4a4a4a;
}}
.glc-confirm-ok {{
    background-color: #b22222;
    color: #ffffff;
}}
.glc-confirm-ok:hover {{
    background-color: #c93030;
}}
.glc-weather {{
    border-top: 1px solid rgba({r}, {g}, {b}, 0.2);
}}
.glc-weather-temp {{
    color: {hex_color};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}}
.glc-weather-desc {{
    color: {hex_color};
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}}
.glc-weather-forecast {{
    border-top: 1px solid rgba({r}, {g}, {b}, 0.2);
}}
.glc-weather-day-header {{
    color: {hex_color};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}}
.glc-weather-forecast-time {{
    color: {hex_color};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}}
.glc-weather-forecast-temp {{
    color: {hex_color};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}}
.glc-weather-forecast-wind-icon {{
    color: {hex_color};
}}
.glc-weather-forecast-wind-text {{
    color: {hex_color};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}}
.glc-weather-button-label {{
    color: {hex_color};
}}
.glc-weather-panel {{
    background-color: rgba(0, 0, 0, 0.92);
    border: 1px solid rgba({r}, {g}, {b}, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}}
.glc-settings-backdrop {{
    background-color: rgba(0, 0, 0, 0.6);
}}
.glc-settings-dialog {{
    background-color: #1d1d1d;
    border: 1px solid rgba({r}, {g}, {b}, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}}
.glc-settings-title {{
    color: {hex_color};
}}
.glc-settings-label {{
    color: #e6e6e6;
}}
.glc-settings-entry {{
    background-color: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border: 1px solid rgba({r}, {g}, {b}, 0.3);
}}
.glc-settings-entry:focus {{
    border: 1px solid rgba({r}, {g}, {b}, 0.8);
}}
.glc-settings-button {{
    border: 1px solid rgba({r}, {g}, {b}, 0.3);
    color: {hex_color};
}}
.glc-settings-button:hover {{
    background-color: rgba({r}, {g}, {b}, 0.2);
}}
.glc-settings-gear {{
    color: {hex_color};
}}
.glc-loading-text {{
    color: {hex_color};
}}
"""
with open(f"{out_dir}/theme.css", "w") as f:
    f.write(theme_css)

# Generate arrow.svg
arrow_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
  <path d="M10.394,19.718L16.975,0.56C17.116,0.15 16.624,-0.179 16.304,0.109L10.278,5.539C10.12,5.681 9.88,5.681 9.722,5.539L3.696,0.109C3.376,-0.179 2.884,0.15 3.025,0.56L9.606,19.718C9.736,20.094 10.264,20.094 10.394,19.718Z" fill="{hex_color}"/>
</svg>
'''
with open(f"{out_dir}/arrow.svg", "w") as f:
    f.write(arrow_svg)

# Generate spinner.svg
spinner_svg = f'<svg fill="{hex_color}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"/></svg>\n'
with open(f"{out_dir}/spinner.svg", "w") as f:
    f.write(spinner_svg)

print(f"  Generated theme.css, arrow.svg, spinner.svg with color {hex_color}")
PYEOF

chmod 666 /etc/gdm-login-custom/theme.css
chmod 666 /etc/gdm-login-custom/arrow.svg
chmod 666 /etc/gdm-login-custom/spinner.svg

# --- 2. ensure /etc/dconf/profile/gdm exists --------------------------------
echo ""
echo "==> Ensuring dconf GDM profile exists at ${DCONF_PROFILE}"
mkdir -p "$(dirname "${DCONF_PROFILE}")"

NEEDS_PROFILE=0
if [[ ! -f "${DCONF_PROFILE}" ]]; then
    NEEDS_PROFILE=1
elif ! grep -q "^system-db:gdm$" "${DCONF_PROFILE}" 2>/dev/null; then
    NEEDS_PROFILE=1
fi

if [[ ${NEEDS_PROFILE} -eq 1 ]]; then
    if [[ -f "${DCONF_PROFILE}" ]]; then
        cp -a "${DCONF_PROFILE}" "${DCONF_PROFILE}.bak.$(date +%s)"
        echo "    Backed up existing ${DCONF_PROFILE}"
    fi
    cat > "${DCONF_PROFILE}" <<'EOF'
user-db:user
system-db:gdm
file-db:/usr/share/gdm/greeter-dconf-defaults
EOF
    chmod 644 "${DCONF_PROFILE}"
    chown root:root "${DCONF_PROFILE}"
    echo "    Created ${DCONF_PROFILE}"
else
    echo "    ${DCONF_PROFILE} already has system-db:gdm — leaving alone."
fi

# --- 3. create the keyfile that enables the extension -----------------------
echo ""
echo "==> Creating dconf keyfile ${DCONF_KEYFILE}"
mkdir -p "${DCONF_KEYFILE_DIR}"

cat > "${DCONF_KEYFILE}" <<EOF
# Enabled by install.sh for the GDM Login Customizer extension.
[org/gnome/shell]
enabled-extensions=['${EXT_UUID}']
disable-user-extensions=false
EOF
chmod 644 "${DCONF_KEYFILE}"
chown root:root "${DCONF_KEYFILE}"

# --- 4. compile the dconf database ------------------------------------------
echo ""
echo "==> Recompiling dconf databases"
dconf update

# --- 5. enable for the regular user session too -----------------------------
echo ""
echo "==> Enabling extension for current user session"
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
# gnome-extensions enable needs the user's D-Bus session.
# Find it via the user's systemd session.
USER_UID=$(id -u "${REAL_USER}" 2>/dev/null || echo 0)
if [[ "${USER_UID}" != "0" ]]; then
    # Try to enable via the user's session bus.
    DBUS_ADDR="unix:path=/run/user/${USER_UID}/bus"
    if [[ -S "/run/user/${USER_UID}/bus" ]]; then
        runuser -u "${REAL_USER}" -- \
            env DBUS_SESSION_BUS_ADDRESS="${DBUS_ADDR}" \
            gnome-extensions enable "${EXT_UUID}" 2>/dev/null && \
            echo "    ✓ Enabled for user ${REAL_USER}" || \
            echo "    (could not enable — run 'gnome-extensions enable ${EXT_UUID}' after login)"
    else
        echo "    (user session bus not found — run 'gnome-extensions enable ${EXT_UUID}' after login)"
    fi
fi

# --- 6. done — show instructions --------------------------------------------
echo ""
echo "============================================================"
echo "                 Installation complete!"
echo "============================================================"
echo ""
echo "  To activate the extension:"
echo "    1. Sign out of your session"
echo "    2. The login screen will now show the customized UI"
echo "    3. After logging back in, the Weather button appears"
echo "       in your topbar"
echo ""
echo "  To change settings later:"
echo "    Click the gear icon in the weather panel (topbar)"
echo ""

echo "Done."
