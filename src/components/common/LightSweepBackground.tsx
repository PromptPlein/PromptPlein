// Heldachtergrond zonder WebGL: een vlak rijksblauw verloop met één lichtbaan die
// eens per elf seconden voorbijkomt. De stijl staat in index.css (.hero-sweep).
// Decoratief: pointer-events staat uit en het blok is verborgen voor schermlezers.

export default function LightSweepBackground({ className = '' }: { className?: string }) {
  return (
    <div
      className={`hero-sweep pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    />
  );
}
