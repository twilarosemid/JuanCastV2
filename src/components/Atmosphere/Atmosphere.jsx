import './Atmosphere.css';

// JuanCast backdrop: bright brand-blue sky with the cloud-swirl pattern.
// Home's hero banner still tints it through --tint; two soft light drifts keep it alive.
export default function Atmosphere() {
  return (
    <div className="atmos" aria-hidden="true">
      <span className="clouds" />
      <span className="orb o1" />
      <span className="orb o2" />
      <span className="shade" />
    </div>
  );
}
