const express = require('express');
const axios = require('axios');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middlewares

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7x5x4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();


        const menuCollection = client.db("bistroDB").collection('menu');
        const userCollection = client.db("bistroDB").collection('users');
        const reviewCollection = client.db("bistroDB").collection('reviews');
        const cartCollection = client.db("bistroDB").collection('carts');
        const paymentCollection = client.db("bistroDB").collection('payments');

        // jwt related api

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            // console.log('inside verifyToken', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized Access' });
                }
                req.decoded = decoded;
                next();
            })

        }

        // use verifyAdmin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            next();
        }

        // user related api

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden Access' });
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesn't exist:
            // you can do this many ways (1. email unique, 2. upsert, 3. simple checking)
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: "User Already Exists", insertedId: null })
            }

            const result = await userCollection.insertOne(user);
            res.send(result)
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // menu related apis
        app.get('/menu', async (req, res) => {
            const cursor = menuCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        });

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result);
        });

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const query = { _id: id };
            const result = await menuCollection.findOne(query);
            res.send(result);
        });

        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: id };
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })


        app.get('/reviews', async (req, res) => {
            const cursor = reviewCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        });

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent');
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        // payment related apis

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            // carefully delete each item from the card
            console.log('payment info', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ paymentResult, deleteResult });
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "Forbidden Access" });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        });

        app.post('/create-ssl-payment', async (req, res) => {
            const payment = req.body;
            const trxId = new ObjectId().toString();
            payment.transactionId = trxId;

            // Store ID: bistr67d922f7120e6
            // Store Password(API / Secret Key): bistr67d922f7120e6@ssl
            // Merchant Panel URL: https://sandbox.sslcommerz.com/manage/ (Credential as you inputted in the time of registration)
            // Store name: testbistrxit5
            // Registered URL: www.bistroboss.com
            // Session API to generate transaction: https://sandbox.sslcommerz.com/gwprocess/v3/api.php
            // Validation API: https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?wsdl
            // Validation API(Web Service) name: https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php


            const initiate = {
                store_id: "bistr67d922f7120e6",
                store_passwd: "bistr67d922f7120e6@ssl",
                total_amount: payment.price,
                currency: "BDT",
                tran_id: trxId,
                success_url: "http://localhost:5000/success-payment",
                fail_url: "http://localhost:5173/fail",
                cancel_url: "http://localhost:5173/cancel",
                ipn_url: "http://localhost:5000/ipn-success-payment",
                cus_name: 'Customer Name',
                cus_email: `${payment.email}`,
                cus_add1: "Dhaka&",
                cus_add2: "Dhaka&",
                cus_city: "Dhaka&",
                cus_state: "Dhaka&",
                cus_postcode: 1000,
                cus_country: "Bangladesh",
                cus_phone: "01711111111",
                cus_fax: "01711111111",
                shipping_method: "NO",
                product_name: "Laptop",
                product_profile: "general",
                product_category: "Laptop",
                multi_card_name: "mastercard,visacard,amexcard",
                value_a: "ref001_A&",
                value_b: "ref002_B&",
                value_c: "ref003_C&",
                value_d: "ref004_D"
            }

            const iniResponse = await axios({
                url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
                method: "POST",
                data: initiate,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
            });

            const saveData = await paymentCollection.insertOne(payment);
            const gatewayUrl = iniResponse?.data?.GatewayPageURL

            res.send({ gatewayUrl });
        });

        app.post('/success-payment', async (req, res) => {
            const paymentSuccess = req.body;

            // VALIDATION
            const { data } = await axios.get(`https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=${paymentSuccess.val_id}&store_id=bistr67d922f7120e6&store_passwd=bistr67d922f7120e6@ssl&format=json`);

            if (data.status !== 'VALID') {
                return res.send({ message: "Invalid Payment" })
            }

            // Update The Payment

            const updatePayment = await paymentCollection.updateOne({ transactionId: data.tran_id }, {
                $set: {
                    status: "success"
                }
            });

            const payment = await paymentCollection.findOne({ transactionId: data.tran_id })

            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            const deleteResult = await cartCollection.deleteMany(query);

            res.redirect('http://localhost:5173/success')
        })


        // stats or analytics

        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price , 0);

            // this is the better way
            const revenue = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$price" }
                    }
                }
            ]).toArray();

            const totalRevenue = revenue[0]?.total || 0;

            res.send({
                users,
                menuItems,
                orders,
                totalRevenue,
            })
        });


        app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: {
                            $sum: 1
                        },
                        revenue: { $sum: '$menuItems.price' }

                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }


            ]).toArray();

            res.send(result);
        })




        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('boss is sitting')
});

app.listen(port, () => {
    console.log(`Bistro Boss Is Sitting On Port: ${port}`)
});

/*
NAMING CONVENTION
app.get('/users')
app.get('/users/:id')
app.post('/users')
app.put('/users/:id')
app.patch('/users/:id')
app.delete('/users/:id')
*/
