export function createRecordDialog() {
  const byId = id => document.getElementById(id);
  const dialog = byId('record-dialog');
  const form = byId('record-form');
  const fields = byId('record-fields');
  const save = byId('record-save');
  const status = byId('record-status');
  let active;
  let connection = {};

  function addField(field) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement(field.options ? 'select' : 'input');
    input.name = field.name;
    input.required = Boolean(field.required);
    if (field.options) {
      for (const [value, title] of field.options) input.add(new Option(title, value));
      if (field.value && !field.options.some(([value]) => value === field.value)) {
        input.add(new Option(field.value, field.value));
      }
    } else {
      input.type = field.type || 'text';
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.type === 'number') {
        input.min = '1';
        input.max = '100';
        input.step = '1';
      }
    }
    input.value = field.value ?? '';
    label.append(input);
    fields.append(label);
  }

  function render() {
    if (!active) return;
    const { busy, pending, conflict } = active;
    fields.disabled = busy || pending;
    save.disabled = busy || conflict || (pending ? !connection.retryable : !connection.editable);
    save.textContent = busy ? 'Saving…' : pending ? 'Check and retry' : active.label;
    if (pending && !busy) status.textContent = connection.notice;
  }

  function close({ restoreFocus = true } = {}) {
    if (!active) return;
    const trigger = active.trigger;
    active = undefined;
    dialog.close();
    fields.replaceChildren();
    byId('record-title').textContent = '';
    byId('record-description').textContent = '';
    status.textContent = '';
    if (restoreFocus) {
      if (trigger instanceof HTMLElement && trigger.isConnected && !trigger.disabled) trigger.focus();
      else document.querySelector('.nav-tab-btn[aria-pressed="true"]')?.focus();
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!active || save.disabled) return;
    const current = active;
    const input = current.pending ? undefined : new FormData(form);
    current.busy = true;
    status.textContent = '';
    render();
    try {
      const result = await current.submit(input);
      if (active !== current) return;
      if (result === true) {
        close();
        return;
      }
      if (typeof result === 'string') {
        status.textContent = result;
        return;
      }
      current.pending = connection.hasPending;
      current.conflict = !current.pending;
      status.textContent = connection.notice;
      if (current.conflict) status.textContent += ' Close this dialog to review the current entry.';
    } finally {
      if (active === current) {
        current.busy = false;
        render();
      }
    }
  });

  byId('record-cancel').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });

  return {
    open({ title, description, controls = [], label = 'Save', submit, trigger }) {
      if (!connection.editable || active) return;
      active = { label, submit, trigger, busy: false, pending: false, conflict: false };
      byId('record-title').textContent = title;
      byId('record-description').textContent = description;
      fields.replaceChildren();
      for (const field of controls) addField(field);
      render();
      dialog.showModal();
      (fields.querySelector('input, select') ?? byId('record-cancel')).focus();
    },
    setConnection(next) {
      connection = next;
      render();
    },
    close,
  };
}
