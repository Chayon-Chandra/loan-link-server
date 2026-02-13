// backend/index.js

const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gs8nds9.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

async function run() {
  try {
    await client.connect();

    const database = client.db('loan-link');
    const loanCollection = database.collection('loans');
    const loanApplication = database.collection('loan-application');
    const usersCollection = database.collection('users');

    // ===== Middleware =====
    const verifyManager = async (req, res, next) => {
      const email = req.query.email;
      if (!email) return res.status(401).send({ message: "Unauthorized" });

      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(401).send({ message: "User not found" });

      if (user.role !== "manager") return res.status(403).send({ message: "Forbidden access" });

      next();
    };

    // ===== User APIs =====

    // Create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = user.role || "borrower";

      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) return res.send({ message: "User already exists" });

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // Get all users
  app.get("/users", async (req, res) => {
     const users = await usersCollection.find().toArray();
    res.send(users); 
  });


    // Get user role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ role: user.role });
    });

    // Make a user manager (Manager only)
    app.patch("/users/make-manager/:id", verifyManager, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "manager" } }
      );
      res.send(result);
    });

    // ===== Loan APIs =====

    // Get all loans
    app.get('/loans', async (req, res) => {
      const loans = await loanCollection.find().toArray();
      res.send(loans);
    });

    // Get latest 6 loans (newest first)
    app.get('/latest-loan', async (req, res) => {
      const loans = await loanCollection.find().sort({ createdAt: -1 }).limit(6).toArray();
    res.send(loans);
});


    // Get loan details by ID
    app.get('/loan-details/:id', async (req, res) => {
      const id = req.params.id;
      const loan = await loanCollection.findOne({ _id: new ObjectId(id) });
      res.send(loan);
    });

    // ===== Loan Application APIs =====

    // Apply for a loan
    app.post('/loan-apply', async (req, res) => {
      const loan = req.body;
      loan.status = 'pending';
      loan.appliedAt = new Date();
      const result = await loanApplication.insertOne(loan);
      res.send(result);
    });
    app.get("/loans/:id", async (req, res) => {
      const id = req.params.id;
      const result = await loanCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/loans/:id", async (req, res) => {
      const id = req.params.id;
      const updatedLoan = req.body;
      const result = await loanCollection.updateOne(
       { _id: new ObjectId(id) },
        {
         $set: updatedLoan,
        }
    );
  res.send(result);
});



    // Get my loans (latest first)
    app.get('/my-loan', async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(401).send({ message: "Email required" });

      const loans = await loanApplication
        .find({ userEmail: email })
        .sort({ appliedAt: -1 })
        .toArray();
      res.send(loans);
    });

    // Get pending loans (Manager only)
    app.get('/pending-loans', verifyManager, async (req, res) => {
      const loans = await loanApplication
        .find({ status: 'pending' })
        .sort({ appliedAt: -1 })
        .toArray();
      res.send(loans);
    });

    // Update loan status (Manager only)
    app.patch('/update-loan/:id', verifyManager, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await loanApplication.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // Delete a loan
    app.delete('/my-loan/:id', async (req, res) => {
      const id = req.params.id;
      const result = await loanApplication.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // Approve loan
  app.patch("/approve-loan/:id", async (req, res) => {
    const id = req.params.id;
    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
        {
         $set: {
              status: "approved",
              approvedAt: new Date(),
            },
        }
      );
    res.send(result);
  });



    console.log('Successfully connected to MongoDB!');
  } finally {
    // Optional: await client.close();
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
