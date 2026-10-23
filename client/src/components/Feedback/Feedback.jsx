import Modal from '../Modal/Modal';

// Animated success / error dialog (same look as the vote result on the Polls page).
// state = { open, type: 'success' | 'error', message }
export default function Feedback({ state, onClose }) {
  const type = state.type === 'success' ? 'success' : 'error';
  return (
    <Modal open={state.open} onClose={onClose} role="alertdialog" label={type === 'success' ? 'Success' : 'Error'}>
      <div className="center">
        <div className={`fb-icon ${type}`}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle className="ring" cx="32" cy="32" r="28" />
            {type === 'success'
              ? <path className="mark" d="M20 33l8 8 16-17" />
              : <path className="mark" d="M22 22l20 20M42 22L22 42" />}
          </svg>
        </div>
        <h3 className={type}>{type === 'success' ? 'Success!' : 'Oops!'}</h3>
        <p className="feedback-message">{state.message}</p>
        <button type="button" className="btn-solid" onClick={onClose}>Got it</button>
      </div>
    </Modal>
  );
}
