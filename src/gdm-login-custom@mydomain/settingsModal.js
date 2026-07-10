// settingsModal.js — Settings modal dialog for the weather panel.
//
// Fields:
//   - Accent color (hex text entry, e.g. #f56691)
//   - Forecast time slots (number)
//   - Location (city name, validated against wttr.in on save)
//
// Buttons: Save, Cancel

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadConfig, saveConfig } from './settings.js';
import { WEATHER_LANG } from './config.js';

export const SettingsModal = GObject.registerClass(
class SettingsModal extends St.BoxLayout {
    _init(extensionPath, onClose) {
        super._init({
            style_class: 'glc-settings-dialog',
            vertical: true,
        });
        this._extensionPath = extensionPath;
        this._onClose = onClose;
        this._httpSession = null;
        this._stageKey = null;

        const settings = loadConfig();

        // Title
        const title = new St.Label({
            text: 'Settings',
            style_class: 'glc-settings-title',
        });

        // --- Accent color row ---
        const colorRow = new St.BoxLayout({
            style_class: 'glc-settings-row',
        });
        const colorLabel = new St.Label({
            text: 'Color',
            style_class: 'glc-settings-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._colorEntry = new St.Entry({
            text: settings.accentColor,
            style_class: 'glc-settings-entry',
            can_focus: true,
            x_expand: true,
        });
        colorRow.add_child(colorLabel);
        colorRow.add_child(this._colorEntry);

        // --- Forecast slots row ---
        const slotsRow = new St.BoxLayout({
            style_class: 'glc-settings-row',
        });
        const slotsLabel = new St.Label({
            text: 'Time slots',
            style_class: 'glc-settings-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._slotsEntry = new St.Entry({
            text: String(settings.forecastHours),
            style_class: 'glc-settings-entry',
            can_focus: true,
            x_expand: true,
        });
        slotsRow.add_child(slotsLabel);
        slotsRow.add_child(this._slotsEntry);

        // --- Location row ---
        const locRow = new St.BoxLayout({
            style_class: 'glc-settings-row',
        });
        const locLabel = new St.Label({
            text: 'City',
            style_class: 'glc-settings-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._locEntry = new St.Entry({
            text: settings.location,
            style_class: 'glc-settings-entry',
            can_focus: true,
            x_expand: true,
        });
        locRow.add_child(locLabel);
        locRow.add_child(this._locEntry);

        // --- Buttons ---
        const buttonRow = new St.BoxLayout({
            style_class: 'glc-settings-buttons',
            x_expand: true,
        });

        const cancelBtn = new St.Button({
            style_class: 'glc-settings-button',
            label: 'Cancel',
            can_focus: true,
            x_expand: true,
        });
        cancelBtn.connect('clicked', () => this._close());

        this._saveBtn = new St.Button({
            style_class: 'glc-settings-button',
            label: 'Save',
            can_focus: true,
            x_expand: true,
        });
        this._saveBtn.connect('clicked', () => this._onSave());

        buttonRow.add_child(cancelBtn);
        buttonRow.add_child(this._saveBtn);

        // Assemble
        this.add_child(title);
        this.add_child(colorRow);
        this.add_child(slotsRow);
        this.add_child(locRow);
        this.add_child(buttonRow);

        // Backdrop
        this._backdrop = new St.Bin({
            style_class: 'glc-settings-backdrop',
            child: this,
        });
        this._backdrop.set_x_align(Clutter.ActorAlign.CENTER);
        this._backdrop.set_y_align(Clutter.ActorAlign.CENTER);
    }

    show() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (monitor) {
            this._backdrop.set_size(monitor.width, monitor.height);
            this._backdrop.set_position(monitor.x, monitor.y);
        }
        Main.uiGroup.add_child(this._backdrop);
        Main.uiGroup.set_child_above_sibling(this._backdrop, null);

        this._colorEntry.grab_key_focus();

        this._stageKey = global.stage.connect('key-press-event', (s, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _validateHex(hex) {
        return /^#[0-9a-f]{6}$/i.test(hex);
    }

    _onSave() {
        const color = this._colorEntry.get_text().trim();
        const slots = parseInt(this._slotsEntry.get_text().trim(), 10);
        const location = this._locEntry.get_text().trim();

        // Validate hex color
        if (!this._validateHex(color)) {
            this._colorEntry.add_style_class_name('glc-settings-entry-error');
            return;
        }
        this._colorEntry.remove_style_class_name('glc-settings-entry-error');

        // Validate slots
        if (isNaN(slots) || slots < 1 || slots > 24) {
            this._slotsEntry.add_style_class_name('glc-settings-entry-error');
            return;
        }
        this._slotsEntry.remove_style_class_name('glc-settings-entry-error');

        // Validate location against wttr.in
        this._locEntry.remove_style_class_name('glc-settings-entry-error');
        if (!location) {
            this._locEntry.add_style_class_name('glc-settings-entry-error');
            return;
        }

        // Show feedback on the save button.
        this._saveBtn.set_label('Validating...');
        this._saveBtn.reactive = false;

        this._validateLocation(location, (valid, errorReason) => {
            // Restore save button.
            this._saveBtn.set_label('Save');
            this._saveBtn.reactive = true;

            if (!valid) {
                this._locEntry.add_style_class_name('glc-settings-entry-error');
                if (errorReason)
                    log(`[gdm-login-custom] Location not saved: ${errorReason}`);
                return;
            }

            // All valid — save (saveConfig writes to /etc/gdm-login-custom/config.json)
            const config = loadConfig();
            config.accentColor = color;
            config.forecastHours = slots;
            config.location = location;
            saveConfig(config);

            log('[gdm-login-custom] Settings saved + theme.css + arrow.svg regenerated');

            this._close();
        });
    }

    _validateLocation(location, callback) {
        if (!this._httpSession) {
            this._httpSession = new Soup.Session();
            // 10 second timeout so the user isn't stuck forever.
            this._httpSession.set_timeout(10);
        }

        const url = `https://${WEATHER_LANG}.wttr.in/${encodeURIComponent(location)}?format=j1`;
        const msg = Soup.Message.new('GET', url);

        this._httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            let text = '';
            let status = 0;
            try {
                const bytes = session.send_and_read_finish(result);
                text = bytes.get_data().toString();
                status = msg.get_status();
            } catch (e) {
                log(`[gdm-login-custom] Location validation error (no network?): ${e}`);
                // Network error — not the user's fault, don't mark as invalid.
                // Show the error border but log the real reason.
                callback(false, 'No internet connection.');
                return;
            }

            // Check for valid weather data.
            if (text.includes('"current_condition"')) {
                callback(true);
                return;
            }

            // Check for "location not found" from wttr.in.
            if (text.includes('location not found') || text.includes('upstream error')) {
                callback(false, `City '${location}' not found.`);
                return;
            }

            // Unexpected response.
            log(`[gdm-login-custom] Location validation unexpected: HTTP ${status}: ${text.substring(0, 200)}`);
            callback(false, 'Unexpected response from wttr.in.');
        });
    }

    _close() {
        if (this._stageKey) {
            global.stage.disconnect(this._stageKey);
            this._stageKey = null;
        }
        if (this._backdrop && this._backdrop.get_parent())
            this._backdrop.get_parent().remove_child(this._backdrop);
        // Call onClose BEFORE destroy so the callback runs while we
        // still exist. This resets the _settingsModalOpen flag.
        if (this._onClose)
            this._onClose();
        if (!this.is_destroyed())
            this.destroy();
    }
});
