const express = require('express')
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb')
const jwt = require('jsonwebtoken')

const app = express()
const port = process.env.PORT || 5000

const corsConfig = {
    origin: 'http://localhost:3000/',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}
app.use(cors(corsConfig))
app.options("*", cors(corsConfig))
app.use(express.json())
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000")
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept,authorization")
    next()
})


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x28g3.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access' })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded
        next()
    })
}

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('booking')
        const userCollection = client.db('doctors_portal').collection('users')

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const services = await cursor.toArray()
            res.send(services)
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                const filter = { email: email }
                const updateDoc = {
                    $set: { role: 'admin' }
                }
                const result = await userCollection.updateOne(filter, updateDoc)
                res.send(result)
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }

        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        })

        //warning:
        //this is not the proper way to query
        //after learning more about mongoDB . use aggregate lookup , pipeline, match, group

        app.get('/available', async (req, res) => {
            const date = req.query.date
            //step 1 : get all services
            const services = await serviceCollection.find().toArray()
            //step 2 : get the booking of that day
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray()
            //step 3 : for each service 
            services.forEach(service => {
                //step 4 : find booking for that service
                const serviceBookings = bookings.filter((book => book.treatment === service.name))
                //step 5 : select slots for the service Bookings
                const bookedSlots = serviceBookings.map(book => book.slot)
                //step 6 : select those slots that are not in bookedSlots
                const available = service.slots.filter(slots => !bookedSlots.includes(slots))
                //step 7 : set available to slots to make it easier
                service.slots = available

            })

            res.send(services)


        })

        /**
      * API NAMING CONVENTIONS
      * app.get('/booking')  //get all booking in this collections.or get more then one . or by filter/query .
      * app.get('/booking/:id') //get a specific booking
      * app.post('/booking') //add a new booking.
      * app.patch('/booking/:id') //update a new booking 
      * app.put('/booking/:id') // if user exist then update the user in doesn't exist the create the user.
      * app.delete('/booking/:id') //delete a booking
     */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient
            const decodedEmail = req?.decoded?.email
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await bookingCollection.find(query).toArray()
                return res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }

        })

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({ success: true, result })
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from doctor!')
})

app.listen(port, () => {
    console.log(`doctor app listening on port ${port}`)
})