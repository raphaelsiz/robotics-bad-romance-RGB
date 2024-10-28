import PNG from 'png-js';
import { createCanvas, loadImage  } from 'canvas';
import { exec } from 'child_process';
import {writeFile,appendFile,open} from 'node:fs'


// edit these:
const fps = 23.98
const targetFps = 3;
const startAt = 18.75; //seconds
const endAt = 118; //seconds -- 0 to end at the natural end of the video
const logInterval = 1 //seconds
const outputDir = "avg-most-colorful-50"



var spf = 1/fps
var targetSpf = 1/targetFps
var time = 0;
var frames = []
var lastLog = 0;
var lastFrame = 0;

async function findAverageColor (maxColors) {
    frames = []
    let frameNum = 0;
    for (let i = 1; i <= 7393; i++) {
        time += spf
        if (time > startAt && (time <= endAt || endAt <= 0)) {
            let filename = i.toString().padStart(5,0) + ".png"
            let canvas = createCanvas(4,4);
            let ctx = canvas.getContext('2d')
            let frame = await new Promise((resolve,reject) => {
                PNG.decode(filename, data=>{
                    // data = 1d array in RGBA order
                    // pixels = 1d array of objects with r, g, b, and a
                    let pixels = []
                    for (let j = 0; j < data.length; j+=4) {
                        let r= data[j],
                            g= data[j + 1],
                            b= data[j + 2],
                            a= data[j + 3]
                        let mean = (r + g + b)/3
                        let std = (((r-mean)**2 + (g-mean)**2 + (b-mean)**2)/3) ** (1/2)
                        pixels.push({r,g,b,a,mean,std})
                    }
                    //console.log(pixels)
                    let mostColorful = pixels.sort(byColorVibrance).slice(0,maxColors)
                    //console.log(mostColorful,"\n")
                    
                    let meanR = mostColorful.reduce(sum("r")) / mostColorful.length
                    let meanG = mostColorful.reduce(sum("g")) / mostColorful.length
                    let meanB = mostColorful.reduce(sum("b")) / mostColorful.length
                    let meanA = mostColorful.reduce(sum("a")) / mostColorful.length
                    let meanMean = (meanR + meanG + meanB) /3
                    let meanStd = (((meanR - meanMean)**2 + (meanG - meanMean)**2, (meanB - meanMean)**2)/3) ** (1/2)
                    resolve({
                        r: Math.round(meanR),g:Math.round(meanG),b:Math.round(meanB),a:Math.round(meanA),std:meanStd
                    })
                    
                })
            })
            frames.push(frame)
            if (time - lastFrame > targetSpf) {
                frameNum ++; 
                filename = frameNum.toString().padStart(5,0) + ".png"
                
                lastFrame = time;
                let {r,g,b,a} = frames.sort(byColorVibrance)[0]
                ctx.fillStyle = `rgba(${r},${g},${b},${a})`
                ctx.fillRect(0,0,5,5)
                await new Promise((resolve,reject)=>{
                    canvas.toBuffer((err,buffer)=>{
                        if (err) reject(err)
                        writeFile(`${outputDir}/${filename}`,buffer,err=>{
                            if (err) reject(err)
                            else resolve()
                        })
                    })
                    frames = []
                })
                if (time - lastLog > logInterval) {
                    console.log(`Frame at time ${Math.floor(time/60)}:${time%60}:\n${r}, ${g}, ${b}\n`)
                    lastLog = time;
                } 
            }

        }
    }
    return
}

async function generateCSV() {
    let output = `${outputDir}/output.csv`
    await new Promise((resolve,reject)=>{
        writeFile(output,"R,G,B,s\n",err=>{
            if (err) reject(err)
            else resolve()
        })
    })
    for (let i = 1; i <= 7393; i++) {
        time += targetSpf
        if (time > startAt && (time <= endAt || endAt <=0)) {
            let filename = `${outputDir}/${i.toString().padStart(5,0)}.png`
            console.log(filename)
            let color = await new Promise((resolve,reject) => {
                open(filename,err=>{
                    if (err) resolve("No file at " + filename)
                    else PNG.decode(filename, data=>{
                        let r= data[0],
                            g= data[1],
                            b= data[2]
                        let rgb = `${r},${g},${b},${time}\n`
                        appendFile(output,rgb,err=>{
                            if (err) reject(err)
                            else resolve(rgb)
                        })
                    })
                })
            })
            if (time - lastLog > logInterval) {
                console.log(color)
                lastLog = time;
            }
            
        }
    }
    return
}

async function findAndGenerate() {
    await findAverageColor(50)
    await generateCSV()
    exec(`ffmpeg -i ${outputDir}/%05d.png -ss ${startAt} -to ${endAt} -i audio.mp3 -c:v libx264 -framerate ${targetFps} -r ${targetFps} -pix_fmt yuv420p -c:a copy -shortest ${outputDir}.mp4`)

}

generateCSV()



function sum(value) {
    return function (accumulator, currentValue) {
        if (typeof accumulator == 'number') return accumulator + currentValue[value]
        else return accumulator[value] + currentValue[value]
    }
}
function byColorVibrance(a,b) {
    return b.std - a.std
}