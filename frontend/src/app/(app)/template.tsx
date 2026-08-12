/**
 * Route-group template remounts on navigation. Page transitions are handled
 * by PageTransition in the layout (fade only), so this stays a
 * plain pass-through to avoid stacking two animations.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return children;
}
