/**
 * De begroeting boven een leeg gesprek, op basis van de tijd op het apparaat van
 * de gebruiker.
 *
 * Wie tussen vijf en zeven uur 's ochtends begint, is een early bird; daar
 * hoort geen naam bij. Na middernacht en voor vijven zegt niemand goedemorgen,
 * dus die uren horen nog bij de avond.
 *
 * @param name Voornaam; leeg of ontbrekend geeft een begroeting zonder naam.
 * @param hour Het uur van de dag (0 t/m 23).
 */
export function greeting(name: string | null | undefined, hour: number): string {
  if (hour >= 5 && hour < 7) return 'Goedemorgen early bird';
  const moment =
    hour >= 7 && hour < 12 ? 'Goedemorgen' : hour >= 12 && hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  const firstName = name?.trim();
  return firstName ? `${moment} ${firstName}` : moment;
}
