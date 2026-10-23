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
  return (
    <>
      <div className="stars-grid">
        {starPackages.map((item, i) => (
          <article className="mk-card stars-card" key={item.amount} style={{ '--i': i }}>
            <img className="stars-img" src={item.image} alt="" />
            <strong className="stars-amount">{item.amount.toLocaleString()}</strong>
            <span className="stars-label">Stars</span>
            <strong className="mk-price">PHP {item.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
          </article>
        ))}
      </div>
      <p className="mk-note">Online checkout is not set up yet.</p>
    </>
  );
}
