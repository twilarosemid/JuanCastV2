import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../../components/Modal/Modal';
import STAR1 from '../../../assets/STAR1.png';
import STAR2 from '../../../assets/STAR2.png';
import STAR3 from '../../../assets/STAR3.png';
import STAR4 from '../../../assets/STAR4.png';
import STAR5 from '../../../assets/STAR5.png';
import STAR6 from '../../../assets/STAR6.png';
import './StarsShop.css';

const starPackages = [
  { amount: 1000, price: 49, image: STAR1 },
  { amount: 5000, price: 159, image: STAR2 },
  { amount: 15000, price: 399, image: STAR3 },
  { amount: 40000, price: 799, image: STAR4 },
  { amount: 100000, price: 1199, image: STAR5 },
  { amount: 500000, price: 2999, image: STAR6 }
];

export default function StarsShop() {
  const [selected, setSelected] = useState(null); // the star package being purchased

  const choose = (item) => setSelected(item);
  const close = () => setSelected(null);

  return (
    <>
      <div className="stars-grid">
        {starPackages.map((item, i) => (
          <article
            className="mk-card stars-card"
            key={item.amount}
            style={{ '--i': i }}
            role="button"
            tabIndex={0}
            aria-label={`Buy ${item.amount.toLocaleString()} Stars for PHP ${item.price}`}
            onClick={() => choose(item)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(item); } }}
          >
            <img className="stars-img" src={item.image} alt="" />
            <strong className="stars-amount">{item.amount.toLocaleString()}</strong>
            <span className="stars-label">Stars</span>
            <strong className="mk-price">PHP {item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
          </article>
        ))}
      </div>

      <Modal open={Boolean(selected)} onClose={close} label="Payment Pending" className="pay-modal">
        <h3>Payment Pending</h3>
        {selected && (
          <div className="pay-summary">
            <img src={selected.image} alt="" />
            <span><strong>{selected.amount.toLocaleString()} Stars</strong><em>PHP {selected.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</em></span>
          </div>
        )}
        <p>Once you have completed payment, please refresh the page to make sure that the stars have been reflected.</p>
        <div className="pay-note" role="note">
          <strong>Note:</strong> Once payment is finished please click the “Redirect to Merchant” button. If the tab is closed before the button is clicked, please wait up to 5 minutes for the transaction to be reflected. In the case where the transaction has not yet reflected during the 5 minute period, please contact our team by navigating to the <Link to="/settings/report" onClick={close}>“Report an Issue”</Link> page.
        </div>
        <p className="pay-confirm">Click “I Understand” to be redirected to the payment page.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn-solid" onClick={close}>I Understand</button>
        </div>
      </Modal>
    </>
  );
}
