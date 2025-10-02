module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",  // penting: `src/**` dan `mdx` juga kalau kamu pakai
    "./pages/**/*.{js,ts,jsx,tsx,mdx}", // opsional
    "./app/**/*.{js,ts,jsx,tsx,mdx}",   // khusus Next.js app dir
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
