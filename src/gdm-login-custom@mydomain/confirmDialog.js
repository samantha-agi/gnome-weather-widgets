// confirmDialog.js — Modal confirmation dialog for the power-off button.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const ConfirmDialog = GObject.registerClass(
class ConfirmDialog extends St.BoxLayout {
    _init(titleText, bodyText, onConfirm) {
        super._init({
            style_class: 'glc-confirm-dialog',
            vertical: true,
        });

        const title = new St.Label({
            text: titleText,
            style_class: 'glc-confirm-title',
        });
        title.clutter_text.set_line_wrap(true);

        const body = new St.Label({
            text: bodyText,
            style_class: 'glc-confirm-body',
        });
        body.clutter_text.set_line_wrap(true);

        const buttonRow = new St.BoxLayout({
            style_class: 'glc-confirm-buttons',
            x_expand: true,
        });

        const cancelBtn = new St.Button({
            style_class: 'glc-confirm-button glc-confirm-cancel',
            label: 'Cancel',
            can_focus: true,
            x_expand: true,
        });
        cancelBtn.connect('clicked', () => this._destroy());
        this._cancelBtn = cancelBtn;

        const confirmBtn = new St.Button({
            style_class: 'glc-confirm-button glc-confirm-ok',
            label: 'Power Off',
            can_focus: true,
            x_expand: true,
        });
        confirmBtn.connect('clicked', () => {
            this._destroy();
            onConfirm();
        });

        buttonRow.add_child(cancelBtn);
        buttonRow.add_child(confirmBtn);

        this.add_child(title);
        this.add_child(body);
        this.add_child(buttonRow);

        // Dimmed backdrop — covers the whole screen behind the dialog.
        this._backdrop = new St.Bin({
            style_class: 'glc-confirm-backdrop',
            child: this,
        });
        this._backdrop.set_x_align(Clutter.ActorAlign.CENTER);
        this._backdrop.set_y_align(Clutter.ActorAlign.CENTER);
        this._stageKey = null;
    }

    show() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (monitor) {
            this._backdrop.set_size(monitor.width, monitor.height);
            this._backdrop.set_position(monitor.x, monitor.y);
        }
        Main.uiGroup.add_child(this._backdrop);
        Main.uiGroup.set_child_above_sibling(this._backdrop, null);

        // Focus the cancel button so keyboard activation works.
        this._cancelBtn.grab_key_focus();

        // Listen for Escape at the stage level (most reliable on GDM).
        this._stageKey = global.stage.connect('key-press-event', (s, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._destroy();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _destroy() {
        if (this._stageKey) {
            global.stage.disconnect(this._stageKey);
            this._stageKey = null;
        }
        if (this._backdrop && this._backdrop.get_parent())
            this._backdrop.get_parent().remove_child(this._backdrop);
        if (!this.is_destroyed())
            this.destroy();
    }
});
