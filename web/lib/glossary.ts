// Centraal woordenboek voor de trading-termen in het dashboard.
// Doel: Dusty leert mee. Elke vakterm krijgt twee lagen uitleg:
//   plain  = mensentaal (waarom het ertoe doet)
//   tech   = de technische definitie (optioneel, voor de verdieping)
//
// Gebruik via <Term id="rsi">RSI</Term> of <InfoTip id="rsi" /> in de UI.
// Geen em-dashes in de teksten (Mono-stijl).

export interface GlossaryEntry {
  /** Korte titel boven de tooltip. */
  title: string;
  /** Mensentaal: wat het is en waarom het telt. */
  plain: string;
  /** Optioneel: de technische definitie of formule. */
  tech?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // --- Portfolio ---
  equity: {
    title: 'Equity',
    plain: 'De totale waarde van de rekening: cash plus alles wat de open posities op dit moment waard zijn. Dit is het getal dat telt of je vooruit of achteruit gaat.',
    tech: 'Equity = cash + marktwaarde van alle open posities tegen de laatste koers.',
  },
  cash: {
    title: 'Cash',
    plain: 'Het geld dat nog vrij is om mee te kopen. Wat niet in een positie zit, staat hier.',
  },
  'day-pnl': {
    title: 'Day P&L',
    plain: 'Winst of verlies van vandaag, sinds de markt openging. Groen is winst, rood is verlies.',
    tech: 'P&L staat voor Profit and Loss. Day P&L = equity nu min equity bij dagstart.',
  },
  deployed: {
    title: 'Deployed',
    plain: 'Hoeveel procent van de rekening op dit moment in posities zit in plaats van in cash. De strategie gaat tot maximaal 75 procent.',
    tech: 'Deployed = 1 min (cash / equity). Cap op 75 procent (3 posities van elk 25 procent).',
  },
  'buying-power': {
    title: 'Buying power',
    plain: 'Hoeveel je in totaal kunt kopen. Op een margin-rekening is dit meer dan je cash, omdat de broker je tijdelijk laat lenen. Wij gebruiken dit bewust beperkt.',
  },

  // --- Posities ---
  position: {
    title: 'Positie',
    plain: 'Een aandeel of ETF dat je hebt gekocht en nog vasthoudt. Zolang je het hebt, beweegt de waarde mee met de koers.',
  },
  'high-watermark': {
    title: 'Hoogste punt (high watermark)',
    plain: 'Het hoogste prijspunt dat een positie bereikte sinds je instapte. De trailing stop hangt hieraan vast en schuift mee omhoog, nooit omlaag.',
  },
  'avg-entry': {
    title: 'Gemiddelde instapprijs',
    plain: 'De prijs waarvoor je gemiddeld instapte. Hiermee wordt je winst of verlies gemeten.',
  },

  // --- Entry-signalen ---
  sma20: {
    title: 'SMA 20 (20-daags gemiddelde)',
    plain: 'De gemiddelde slotkoers van de laatste 20 handelsdagen. Staat de koers erboven, dan is de korte trend omhoog. Een van de zes instapvoorwaarden.',
    tech: 'Simple Moving Average over 20 dagelijkse slotkoersen. Entry-eis: prijs boven SMA20.',
  },
  sma50: {
    title: 'SMA 50 (50-daags gemiddelde)',
    plain: 'Hetzelfde idee als de SMA20, maar over 50 dagen. Bevestigt dat ook de langere trend omhoog is.',
    tech: 'Simple Moving Average over 50 slotkoersen. Entry-eis: prijs boven SMA50.',
  },
  breakout: {
    title: 'Breakout (uitbraak)',
    plain: 'De koers breekt door het hoogste punt van de afgelopen dagen. Dat is het moment waarop momentum vaak doorzet, precies waar deze strategie op meerijdt.',
    tech: 'Huidige prijs boven de hoogste slotkoers van de vorige 5 handelsdagen.',
  },
  'volume-ratio': {
    title: 'Volume-ratio',
    plain: 'Hoeveel er vandaag verhandeld wordt vergeleken met normaal. Meer dan normaal betekent dat er echt kopers achter de beweging zitten, geen toevalstreffer.',
    tech: 'Volume vandaag gedeeld door het 20-daags gemiddelde volume. Entry-eis: 1,1 of hoger.',
  },
  rsi: {
    title: 'RSI (kracht-meter)',
    plain: 'Een meter van 0 tot 100 die laat zien hoe hard een koers de laatste tijd steeg of daalde. Wij willen tussen 50 en 75: genoeg kracht, maar niet zo overdreven dat een terugval dreigt.',
    tech: 'Relative Strength Index over 14 dagen. Entry-eis: tussen 50 en 75. Boven 75 is overbought.',
  },

  // --- Markt-gates ---
  vix: {
    title: 'VIX (angst-index)',
    plain: 'De graadmeter voor onrust op de beurs. Hoog betekent veel angst en grillige koersen. Boven 30 stapt de bot niet meer in.',
    tech: 'CBOE Volatility Index. Boven 30 = geen nieuwe entries die sessie.',
  },
  'earnings-day': {
    title: 'Earnings-dag',
    plain: 'Een dag waarop een groot bedrijf in de ETF zijn cijfers bekendmaakt. Koersen kunnen dan onvoorspelbaar springen, dus de bot blijft eraf.',
  },
  'open-buffer': {
    title: 'Open-buffer',
    plain: 'De eerste vijf minuten na de opening (09:30 tot 09:35) zijn vaak chaotisch. De bot wacht die bewust af voordat hij iets doet.',
  },
  'pre-close': {
    title: 'Pre-close venster',
    plain: 'De laatste 20 minuten voor sluiting (15:40 tot 16:00). Daar plaatst de bot geen nieuwe orders meer, om niet vlak voor het einde nog risico te nemen.',
  },
  'half-day': {
    title: 'Halve handelsdag',
    plain: 'Een dag waarop de beurs vroeg sluit (rond 13:00), zoals rond feestdagen. De bot past zijn afsluit-routine daarop aan.',
  },
  gate: {
    title: 'Gate (poort)',
    plain: 'Een check die langs moet voordat de bot mag handelen. Faalt een gate, dan gaat de trade niet door. Het zijn de veiligheidssloten van de strategie.',
  },
  'no-go': {
    title: 'NO_GO',
    plain: 'Het oordeel dat een kandidaat niet voldoet aan alle voorwaarden. De bot legt altijd vast waarom, zodat je kunt meelezen waarom hij iets oversloeg.',
  },

  // --- Exits / risico ---
  'hard-stop': {
    title: 'Harde stop',
    plain: 'De vaste bodem onder een positie: zakt de koers 2 procent onder je instap, dan verkoopt de bot meteen. Dit is onomzeilbaar en staat als order bij de broker zelf.',
    tech: 'Stop loss op entry maal 0,98. Prioriteit 1, overschrijft alle andere exits.',
  },
  'trailing-stop': {
    title: 'Trailing stop (meelopende stop)',
    plain: 'Een stop die meeschuift omhoog als de koers stijgt, maar nooit terug omlaag. Zo bescherm je opgebouwde winst zonder er te vroeg uit te stappen.',
    tech: 'Verkoop bij 3 procent onder het hoogste punt sinds instap.',
  },
  'take-profit': {
    title: 'Take profit (winst pakken)',
    plain: 'Het punt waarop de bot de winst veiligstelt: bij 5 procent boven je instap wordt automatisch verkocht.',
    tech: 'Limit-order op entry maal 1,05. Staat als order bij de broker.',
  },
  'bracket-order': {
    title: 'Bracket-order',
    plain: 'Een koop waarbij meteen twee uitgangen worden meegestuurd: de harde stop eronder en de take profit erboven. Ze staan bij de broker, dus ze vuren ook als de bot even niets doet.',
    tech: 'Een order met gekoppelde stop loss en take profit (OCO). Een van beide sluit de positie.',
  },
  'eod-close': {
    title: 'EOD-close (sluiten aan het eind van de dag)',
    plain: 'Aan het eind van elke handelsdag sluit de bot alles. Deze strategie houdt niets vast over nacht, om verrassingen bij de volgende opening te vermijden.',
    tech: 'End Of Day. Alle posities dicht rond 16:10 ET, tenzij hold_overnight aan staat.',
  },

  // --- Sizing ---
  'position-sizing': {
    title: 'Positiegrootte',
    plain: 'Hoeveel geld er in een trade gaat. Standaard 25 procent van de vrije cash, zodat een misser nooit te veel pijn doet.',
    tech: 'Standaard 25 procent van available cash, max 30 procent van de totale equity per symbool.',
  },
  'cash-floor': {
    title: 'Cash-bodem',
    plain: 'Er blijft altijd minstens 10 procent cash op de rekening staan. Zo zit je nooit volledig vol en houd je ruimte over.',
  },
  'max-positions': {
    title: 'Max posities',
    plain: 'De bot houdt er nooit meer dan 3 tegelijk aan. Weinig posities betekent overzicht en minder kans dat één klap de hele rekening raakt.',
  },

  // --- Drawdown / circuit ---
  drawdown: {
    title: 'Drawdown (terugval)',
    plain: 'Hoeveel de rekening is gezakt vanaf een eerder hoogtepunt. Het is de maat voor de pijn onderweg, niet alleen het eindresultaat.',
  },
  'daily-drawdown': {
    title: 'Dag-drawdown',
    plain: 'Het verlies van vandaag ten opzichte van waar je begon. Boven 3 procent legt de bot zichzelf stil voor de rest van de dag.',
  },
  'peak-drawdown': {
    title: 'Piek-drawdown',
    plain: 'De terugval vanaf het hoogste punt van vandaag. Boven 5 procent stopt de bot, ook al sta je nog in de plus ten opzichte van de start.',
  },
  'circuit-breaker': {
    title: 'Circuit breaker (noodrem)',
    plain: 'Een automatische noodrem die alle handel stillegt als het te hard misgaat: te veel verlies, te veel verliezers achter elkaar, of te veel orders in korte tijd. Resetten doe jij bewust, met de hand.',
    tech: 'Trips bij dag-drawdown over 3 procent, 3 verliezers op rij, 5 orders in 10 minuten, of piek-drawdown over 5 procent.',
  },
  'consec-losses': {
    title: 'Verliezers op rij',
    plain: 'Het aantal afgesloten trades met verlies dat direct achter elkaar kwam. Bij 3 op rij grijpt de noodrem in, want dan klopt er iets niet met de markt of de timing.',
  },
  'kill-switch': {
    title: 'Kill switch (noodknop)',
    plain: 'Jouw handmatige noodknop. Zet hem uit en de bot plaatst direct geen nieuwe orders meer. Bestaande stops blijven gewoon actief. Altijd binnen handbereik.',
    tech: 'Zet TRADING_ENABLED op false. Laatste gate voor elke order, werkt zonder herstart.',
  },

  // --- Resultaat-maten ---
  'win-rate': {
    title: 'Win-rate (trefkans)',
    plain: 'Het percentage trades dat met winst sloot. Goede systemen zitten vaak rond 55 tot 65 procent, niet hoger. Het gaat niet om altijd gelijk hebben, maar om winst groter dan verlies.',
  },
  'r-multiple': {
    title: 'R (risico-eenheid)',
    plain: 'Winst of verlies gemeten in hoeveel je riskeerde. Plus 2R betekent dat je twee keer verdiende wat je op het spel zette. Zo vergelijk je trades eerlijk, los van de inzet.',
    tech: '1R = het bedrag tot je stop. Resultaat in R = uitkomst gedeeld door initieel risico.',
  },
  sharpe: {
    title: 'Sharpe-ratio',
    plain: 'Hoeveel rendement je haalt per eenheid risico. Hoger is beter, boven 1,5 is netjes. Het straft systemen af die alleen toevallig veel risico namen.',
  },

  // --- Strategieën / regimes ---
  momentum: {
    title: 'Momentum',
    plain: 'Het idee dat koersen die stijgen vaak nog even doorstijgen. Deze bot rijdt mee op die beweging in plaats van een bodem te raden.',
  },
  'mean-reversion': {
    title: 'Mean reversion (terug naar gemiddelde)',
    plain: 'Het tegenovergestelde van momentum: het idee dat een koers die te ver doorschoot vaak terugveert naar het gemiddelde. Werkt vooral in een zijwaartse markt.',
  },
  regime: {
    title: 'Regime (marktklimaat)',
    plain: 'In wat voor markt zitten we: stijgend, dalend, zijwaarts of onrustig. Slimme bots kiezen hun strategie op basis van het regime in plaats van altijd hetzelfde te doen.',
  },
  bollinger: {
    title: 'Bollinger Bands',
    plain: 'Een boven- en onderband rond het gemiddelde die meebewegen met de beweeglijkheid. Raakt de koers de onderband, dan is hij relatief goedkoop, een signaal voor mean reversion.',
  },
  adx: {
    title: 'ADX (trendsterkte)',
    plain: 'Een meter die zegt hoe sterk een trend is, los van de richting. Hoog betekent duidelijke trend, laag betekent zijwaarts gedoe.',
  },
  breadth: {
    title: 'Breadth (marktbreedte)',
    plain: 'Hoeveel aandelen meedoen met de beweging. Stijgt de beurs maar doet bijna niemand mee, dan is de stijging wankel.',
  },

  // --- Routines ---
  premarket: {
    title: 'Premarket-routine',
    plain: 'Om 08:30 ET, voor de opening. De bot rekent de indicatoren door en maakt een shortlist. Hij plaatst hier nog geen orders.',
  },
  'market-open': {
    title: 'Market-open routine',
    plain: 'Om 09:35 ET. De bot toetst de shortlist aan alle voorwaarden en plaatst de koop-orders die slagen.',
  },
  midday: {
    title: 'Midday-routine',
    plain: 'Om 12:30 ET. De bot checkt de open posities, schuift trailing stops mee en kijkt of er ingegrepen moet worden.',
  },
  weekly: {
    title: 'Weekly review',
    plain: 'Vrijdag na sluiting. De bot kijkt terug op de week, beoordeelt wat werkte en stelt eventueel lessen voor. Hij handelt hier niet.',
  },

  // --- Overig ---
  'paper-trading': {
    title: 'Paper trading',
    plain: 'Handelen met nepgeld tegen echte koersen. Alles werkt als echt, maar er staat geen euro op het spel. Zo bewijst de bot zich eerst voordat er ooit echt geld bij komt.',
  },
  etf: {
    title: 'ETF',
    plain: 'Een mandje aandelen dat als één ding verhandelt, bijvoorbeeld SPY voor de 500 grootste Amerikaanse bedrijven. Breed gespreid, dus minder grillig dan een los aandeel.',
  },
  daytrades: {
    title: 'Daytrades',
    plain: 'Aandelen die je op dezelfde dag koopt en weer verkoopt. In de VS mag dat beperkt op een kleine rekening (de pattern day trader regel), vandaar de teller.',
  },
  slippage: {
    title: 'Slippage',
    plain: 'Het verschil tussen de prijs die je verwachtte en de prijs waarvoor je order echt werd uitgevoerd. Bij snelle markten kan dat net iets ongunstiger uitvallen.',
  },
};

export function getTerm(id: string): GlossaryEntry | undefined {
  return GLOSSARY[id];
}
