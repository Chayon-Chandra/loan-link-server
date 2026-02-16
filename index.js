const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

const port = process.env.PORT || 3000;

// Firebase Admin Setup
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(express.json());
app.use(cors());

// Verify Firebase Token
const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  const token = authorization.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
};

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gs8nds9.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db('loan-link');
    const loanCollection = database.collection('loans');
    const loanApplication = database.collection('loan-application');
    const usersCollection = database.collection('users');

    // ===== Role Verification Middlewares =====

    const verifyAdmin = async (req, res, next) => {
      const email = req.token_email;
      const user = await usersCollection.findOne({ email });

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Admin access required" });
      }
      next();
    };

    const verifyManager = async (req, res, next) => {
      const email = req.token_email;
      const user = await usersCollection.findOne({ email });

      if (user?.role !== "manager") {
        return res.status(403).send({ message: "Manager access required" });
      }
      next();
    };

    // ===== USER APIs =====

    // Create User
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = user.role || "borrower";

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) return res.send({ message: "User already exists" });

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Get All Users (Admin Only)
    app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Get User Role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ role: user.role });
    });

    // Make Manager (Admin Only)
    app.patch("/users/make-manager/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "manager" } }
        );
        res.send(result);
      }
    );

    // ===== LOAN APIs =====

    // Get All Loans
    app.get('/loans', async (req, res) => {
      const loans = await loanCollection.find().toArray();
      res.send(loans);
    });

    // Loan Details
    app.get('/loan-details/:id', async (req, res) => {
      const id = req.params.id;
      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      res.send(loan);
    });

    // ===== LOAN APPLICATION =====

    // Apply Loan
    app.post('/loan-apply', async (req, res) => {
      const loan = req.body;
      loan.status = 'pending';
      loan.appliedAt = new Date();

      const result = await loanApplication.insertOne(loan);
      res.send(result);
    });

    // My Loans
    app.get('/my-loan', verifyFirebaseToken, async (req, res) => {
      const email = req.token_email;

      const loans = await loanApplication
        .find({ userEmail: email })
        .sort({ appliedAt: -1 })
        .toArray();

      res.send(loans);
    });

    // Pending Loans (Manager Only)
    app.get('/pending-loans',
      verifyFirebaseToken,
      verifyManager,
      async (req, res) => {
        const loans = await loanApplication
          .find({ status: 'pending' })
          .sort({ appliedAt: -1 })
          .toArray();
        res.send(loans);
      }
    );

    // Update Loan Status (Manager Only)
    app.patch('/update-loan/:id',
      verifyFirebaseToken,
      verifyManager,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;

        const result = await loanApplication.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.send(result);
      }
    );

    console.log(" MongoDB Connected Successfully!");
  } finally {}
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
