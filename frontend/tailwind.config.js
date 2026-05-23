import withMT from "@material-tailwind/react/utils/withMT";

const safeColors = [
  "gray",
  "slate",
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "emerald",
  "blue",
  "cyan",
  "violet",
  "purple",
];
const safeShades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

export default withMT({
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: safeColors.flatMap((color) => [
    ...safeShades.flatMap((shade) => [
      `bg-${color}-${shade}`,
      `text-${color}-${shade}`,
      `border-${color}-${shade}`,
      `ring-${color}-${shade}`,
      `border-l-${color}-${shade}`,
      `hover:bg-${color}-${shade}`,
      `hover:text-${color}-${shade}`,
      `hover:border-${color}-${shade}`,
    ]),
  ]),
  theme: {
    extend: {},
  },
  plugins: [],
});
