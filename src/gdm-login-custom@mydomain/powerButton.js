// powerButton.js — Power-off button (upper-right) with confirmation dialog.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { ConfirmDialog } from './confirmDialog.js';

export const PowerOffButton = GObject.registerClass(
class PowerOffButton extends St.Button {
    _init() {
        const icon = new St.Icon({
            icon_name: 'system-shutdown-symbolic',
            icon_size: 22,
        });
        super._init({
            style_class: 'glc-power-button',
            can_focus: true,
            child: icon,
        });
        this.connect('clicked', this._onClicked.bind(this));
    }

    _onClicked() {
        const dlg = new ConfirmDialog(
            'Power off the system?',
            'This will shut down the machine now. Unsaved work in any active session will be lost.',
            () => this._doPowerOff()
        );
        dlg.show();
    }

    _doPowerOff() {
        // Talk to systemd-logind directly so we don't depend on session services
        // that aren't available yet on the login screen.
        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null);
            bus.call_sync(
                'org.freedesktop.login1',
                '/org/freedesktop/login1',
                'org.freedesktop.login1.Manager',
                'PowerOff',
                new GLib.Variant('(b)', [true]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            log(`[gdm-login-custom] PowerOff via logind failed: ${e}`);
        }
    }
});
