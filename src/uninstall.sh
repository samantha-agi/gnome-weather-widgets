#!/usr/bin/env bash
#
# uninstall.sh — completely remove the GDM Login Customizer extension.
#
# Removes:
#   1. Extension files from /usr/share/gnome-shell/extensions/
#   2. Settings directory /etc/gdm-login-custom/
#   3. dconf keyfile from /etc/dconf/db/gdm.d/
#   4. Recompiles dconf database
#   5. Disables extension for the current user
#
# Usage:
#   ./uninstall.sh
#
set -euo pipefail

EXT_UUID="gdm-login-custom@mydomain"
DEST_DIR="/usr/share/gnome-shell/extensions/${EXT_UUID}"
SETTINGS_DIR="/etc/gdm-login-custom"
DCONF_KEYFILE_DIR="/etc/dconf/db/gdm.d"
DCONF_KEYFILE="${DCONF_KEYFILE_DIR}/01-${EXT_UUID}"

# Check if we're root.
if [[ $EUID -ne 0 ]]; then
    echo "This script needs root privileges. Re-running with sudo..."
    exec sudo bash "$0" "$@"
fi

# --- 1. disable extension for the current user ------------------------------
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
USER_UID=$(id -u "${REAL_USER}" 2>/dev/null || echo 0)
if [[ "${USER_UID}" != "0" ]]; then
    DBUS_ADDR="unix:path=/run/user/${USER_UID}/bus"
    if [[ -S "/run/user/${USER_UID}/bus" ]]; then
        runuser -u "${REAL_USER}" -- \
            env DBUS_SESSION_BUS_ADDRESS="${DBUS_ADDR}" \
            gnome-extensions disable "${EXT_UUID}" 2>/dev/null && \
            echo "==> Disabled for user ${REAL_USER}" || true
    fi
fi

# --- 2. remove extension files ----------------------------------------------
if [[ -d "${DEST_DIR}" ]]; then
    echo "==> Removing ${DEST_DIR}"
    rm -rf "${DEST_DIR}"
else
    echo "==> ${DEST_DIR} not present; nothing to delete."
fi

# --- 3. remove settings directory -------------------------------------------
if [[ -d "${SETTINGS_DIR}" ]]; then
    echo "==> Removing ${SETTINGS_DIR}"
    rm -rf "${SETTINGS_DIR}"
else
    echo "==> ${SETTINGS_DIR} not present; nothing to delete."
fi

# --- 4. remove dconf keyfile ------------------------------------------------
if [[ -f "${DCONF_KEYFILE}" ]]; then
    echo "==> Removing dconf keyfile ${DCONF_KEYFILE}"
    rm -f "${DCONF_KEYFILE}"
else
    echo "==> ${DCONF_KEYFILE} not present; nothing to remove."
fi

# --- 5. recompile dconf database --------------------------------------------
echo "==> Recompiling dconf databases"
dconf update

# --- 6. done ----------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Uninstallation complete!"
echo "============================================================"
echo ""
echo "  Sign out and back in for changes to take effect."
echo ""
echo "  Note: /etc/dconf/profile/gdm was left in place in case"
echo "  other GDM customizations depend on it. Remove manually"
echo "  if no longer needed:"
echo "    sudo rm /etc/dconf/profile/gdm"
echo ""
