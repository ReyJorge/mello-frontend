// tailwind.config.js
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // důležité!
  ],
  theme: {
    extend: {
      colors: {
        mello: "#059669",
        "mello-light": "#ecfdf5",
      },
    },
  },
  plugins: [],
};
