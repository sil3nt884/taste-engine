import Poster from './Poster';

export default function Cover({
  src,
  seed,
  title,
  size = 'grid',
}: {
  src: string | null | undefined;
  seed: string;
  title: string | null;
  size?: 'grid' | 'detail' | 'thumb';
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={`cover cover-${size}`} src={src} alt={title ?? ''} loading="lazy" />
    );
  }
  return <Poster seed={seed} title={title} size={size} />;
}
