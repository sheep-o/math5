const express = require('express')
const app = express()
const server = require('http').Server(app)
const {Server} = require('socket.io')
const io = new Server(server)
const mjAPI = require('mathjax-node')

const CAM_ENDPOINT = 'https://www.bing.com/cameraexp/api/v1/getlatex'

server.listen(3000, _ => {
	console.log('listening...')
})

io.on('connection', socket => {
	console.log('new connection')

	let options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: ''
	}

	socket.on('read', async img => {
		options.body = `{"data": "${img.replace('data:image/png;base64,', '')}", "inputForm": "Image"}`

		const latex = await fetch('https://www.bing.com/cameraexp/api/v1/getlatex', options)
			.then(res => res.json())
			.then(res => res.latex)
			.catch(err => console.error(err))	
		
		mjAPI.typeset({
			math: String.raw`${latex}`,
			format: "TeX", // or "inline-TeX", "MathML"
			mml:true,      // or svg:true, or html:true
		}, data => {
			if (!data.errors) {
				socket.send({type: 'latex', content: {latex: latex, html: data.mml}})
			} else socket.send({type: 'latex', content: 'error'})
		})
	})

	socket.on('solve', async latex => {
		options.body = JSON.stringify({latexExpression: latex})

		const data = await fetch('https://www.bing.com/cameraexp/api/v1/solvelatex', options)
			.then(res => res.json())
			.then(res => res.results[0].tags[0].actions[0].customData)
			.catch(err => console.error(err))
	
		let msg = {type: 'solution', content: [
			{
				actions: '',
				html: ''
			}
		]}
		
		if (JSON.parse(JSON.parse(data).previewText).mathSolverResult != null) {
			const actions = JSON.parse(JSON.parse(data).previewText).mathSolverResult.actions

			actions.forEach(action => {
				mjAPI.typeset({
					math: String.raw`${action.solution.replaceAll('$', '')}`,
					format: "TeX", // or "inline-TeX", "MathML"
					mml:true,      // or svg:true, or html:true
				}, data => {
					if (!data.errors) {
						msg.content.push({action: action, html: data.mml})
					} else {
						socket.send({type: 'solution', content: 'error'})
					}
				})	
			})

			socket.send(msg)
		}
	})
})

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html')
})
