import { CompanionCloudReader } from './jane-companion-cloud.mjs';
import { CompanionMailbox } from './jane-companion-mailbox.mjs';
import { CompanionDialogue, companionSpeechContext } from './jane-companion-dialogue.mjs';
import { companionFrame } from './jane-companion-state.mjs';

// Android and Windows use the same selectors, mailbox endpoints and server
// claims. This reader deliberately never starts the main app's write runtime.
export class MobileCompanion {
  constructor({ client, storage, runtime, manifest, onChange = () => {}, post = () => {},
    setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = token => clearTimeout(token), Cloud = CompanionCloudReader }) {
    Object.assign(this, { client, storage, runtime, manifest, onChange, post, setTimer, clearTimer, Cloud });
    this.status = 'connecting'; this.hasSnapshot = false; this.paused = true; this.generation = 0; this.speechSequence = 0;
    this.mail = new CompanionMailbox({ client, storage, owner: () => this.owner,
      context: () => this.context(), onChange: () => this.notify() });
    this.dialogue = new CompanionDialogue({ client, owner: () => this.owner });
  }
  get owner() { return this.status === 'signed_out' ? '' : this.reader?.owner || ''; }
  context() {
    if (!this.hasSnapshot) return {};
    return { context: companionSpeechContext(this.runtime)?.context || null,
      away: this.runtime.getCbiCharacterPresence('jane', new Date())?.location === 'away' };
  }
  frame() {
    if (this.hasSnapshot && this.owner) {
      try { return companionFrame(this.runtime, this.manifest) || this.neutral(); } catch {}
    }
    return this.neutral();
  }
  neutral() { return { key: 'setup', assetId: '00_tea', label: '点击登录同步' }; }
  notify() {
    if (this.paused) return;
    const frame = this.frame();
    const snapshot = { type: 'snapshot', assetId: frame.assetId,
      key: frame.key, label: frame.label, sync: this.status, unread: this.mail.unread };
    const serialized = JSON.stringify(snapshot);
    if (serialized !== this.lastSnapshot) { this.lastSnapshot = serialized; this.post(snapshot); }
    this.onChange(this);
  }
  async resume() {
    if (!this.paused) return;
    this.paused = false; const generation = ++this.generation;
    this.reader = new this.Cloud({ client: this.client, storage: this.storage,
      onChange: () => { if (generation === this.generation) { this.hasSnapshot = true; this.mail.identity(); this.dialogue.identity(); this.notify(); } },
      onStatus: value => {
        if (generation !== this.generation) return;
        this.status = value;
        if (['signed_out', 'unavailable'].includes(value)) { this.hasSnapshot = false; this.dialogue.identity(); }
        this.mail.identity(); this.notify();
      } });
    await this.reader.start();
    if (generation !== this.generation || this.paused) return;
    this.tick(); this.poll();
  }
  pause() {
    if (this.paused) return;
    this.paused = true; this.generation++; this.speechSequence++;
    this.reader?.stop(); this.clearTimer(this.frameTimer); this.clearTimer(this.mailTimer);
  }
  tick() {
    if (this.paused) return;
    this.notify(); this.frameTimer = this.setTimer(() => this.tick(), 15000);
  }
  async poll() {
    if (this.paused) return;
    this.clearTimer(this.mailTimer);
    if (this.polling) return;
    this.polling = true;
    const generation = this.generation;
    try {
      if (this.status === 'connected' && this.owner) await this.mail.call('companion_auto');
    } finally {
      this.polling = false;
      if (!this.paused) {
        // A response from a previous screen/account lifetime cannot schedule a
        // stale loop; the resumed loop gets an immediate fresh poll instead.
        const pending = this.mail.items.some(x => ['queued', 'running'].includes(x.status));
        this.mailTimer = this.setTimer(() => this.poll(), generation !== this.generation ? 0 :
          pending ? this.mail.waiting === 'later' ? 30000 : 5000 : 60000);
      }
    }
  }
  async refresh() {
    if (this.paused) return;
    await this.reader?.refresh();
    if (!this.paused) await this.poll();
  }
  async speech() {
    if (!this.owner || !this.hasSnapshot) { this.post({ type: 'login' }); return; }
    const sequence = ++this.speechSequence, owner = this.owner, frame = this.frame();
    const current = companionSpeechContext(this.runtime);
    let text = '';
    if (current) {
      await this.dialogue.read(current.context);
      text = this.dialogue.line(current.session) || '';
    } else {
      const presence = this.runtime.getCbiCharacterPresence('jane', new Date());
      if (presence?.location === 'away' && presence.endAt > Date.now()) text = '预计还有 ' + Math.ceil((presence.endAt - Date.now()) / 60000) + ' 分钟';
    }
    if (this.paused || sequence !== this.speechSequence || owner !== this.owner || frame.key !== this.frame().key) return;
    this.post({ type: 'speech', key: frame.key, label: frame.label, text });
  }
}
