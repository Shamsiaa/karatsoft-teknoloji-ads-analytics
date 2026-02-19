const express = require("express");
require("dotenv").config();

const reportRoutes = require("./routes/report.route");

const app = express();

app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Routes
app.use("/report", reportRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
