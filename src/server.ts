import express, { Request, Response, json } from "express"
import { Namespace, Server, Socket } from "socket.io"
import cors from "cors"

import { readdirSync, statSync } from "fs"
import { createServer } from "http"

import SchoologyAPI from "schoologyapi"
import { verify } from "jsonwebtoken"

export const schoology = new SchoologyAPI(
    process.env.SCHOOLOGY_KEY!,
    process.env.SCHOOLOGY_SECRET!
)

export const tokens = new Map<string, { key: string, secret: string }>()

const config = { origin: ["http://localhost:3000"] }

const rest = express()
const server = createServer(rest)
const socket = new Server(server, { cors: config })

rest.use(json(), cors(config))

if (process.env.NODE_ENV === "production") {
    import("@socket.io/cluster-adapter")
        .then(({ createAdapter }) => socket.adapter(createAdapter()))
    import("@socket.io/sticky")
        .then(({ setupWorker }) => setupWorker(socket))
}

export type Route = (req: Request, res: Response) => void
export type Handler = (server: Namespace, socket: Socket, data: unknown) => void
type Event = [string, Handler]

const importRoutes = (root: string) => {
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importRoutes(path)
        if (!file.endsWith(".ts")) return
        import(`./${path.slice(4, -3)}`).then(route => {
            const endpoint = path
                .slice(8, -3)
                .replace(/\[([^[\]]+)\]/g, ":$1")
                .replace(/\/index$/g, "") || "/"
            Object.entries(route).forEach(([method, handler]) => {
                if (!(method.toLowerCase() in rest)) return
                rest[method.toLowerCase() as keyof typeof rest](endpoint, handler)
                console.log(`REST ${method} ${endpoint}`)
            })
        })
    })
}

importRoutes("src/rest")

const namespaces: [string, Event[]][] = []

const importEvents = async (root: string) => {
    const events: Event[] = []
    await Promise.all(readdirSync(root).map(async file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importEvents(path)
        if (!file.endsWith(".ts")) return
        await import(`./${path.slice(4, -3)}`).then(({ handler }) => {
            if (!handler) return
            events.push([file.slice(0, -3), handler])
        })
    }))
    if (events.length) {
        const namespace = root.slice(10) || "/"
        namespaces.push([namespace, events])
        console.log(`Socket ${namespace} [${events.map(i => i[0]).join(", ")}]`)
    }
}

importEvents("src/socket").then(() => {
    namespaces.forEach(([namespace, events]) => {
        const ns = socket.of(namespace)
        ns.on("connection", connection => {
            events.forEach(([event, handler]) => {
                connection.on(event, data => {
                    handler(ns, connection, data)
                })
            })
        })
    })
})

socket.of("/auth").on("connection", connection => {
    connection.on("disconnect", () => {
        tokens.delete(connection.id)
    })
})

socket.of("/app").use((socket, next) => {
    const { token } = socket.handshake.auth
    if (!token) next(Error())
    try {
        socket.data = verify(token, process.env.JWT_SECRET!)
        next()
    } catch {
        next(Error())
    }
})

server.listen(443)
//kkoastjraya