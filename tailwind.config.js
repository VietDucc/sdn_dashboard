// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // hoặc đường dẫn phù hợp với dự án của bạn
  ],
  theme: {
    extend: {
      borderColor: {
        border: "hsl(var(--border))",
      },
    },
  },
  plugins: [],
};
