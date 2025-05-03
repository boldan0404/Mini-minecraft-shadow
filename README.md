Surya Chokkar & Krystal An

Extra Credit: We both on our honor completed the course evaluation for the bonus point. 

Program Walkthrough:
We chose to implement the shadow option of the project. Therefore, we implemented shadow mapping, shadow volume, and ambient occlusion and were able to compare the performance of each method through measuring the amount of frames rendered. Additionally, we had another technical contribution, which is smart culling. We implemented frustum and occlusion culling, which helped reduce the strain of the shadows on performance, but also allowed us to add on to an already challenging project and add a second technical contribution. 

We have also included several gradeable artifacts in the zip folder under the file name "gradeable artifacts" that we will describe in further detail below. 

Before describing our findings, we want to quickly go over how to walk through the program when run. This code runs the exact same as minecraft with the same build and run procedure. As soon as the code is run, the program begins in "normal", which has no shadows and is normal minecraft. The user can then toggle through each mode by pressing "T", which will change the mode and the change will be reflected in the top left corner, which keeps track of what mode the user is in at any given time. We also changed the walking mechanics similar to Minecraft's creative mode in which if the user walks off a mountain, they will fly, but if they wish to fall, they can hit the spacebar and they will jump and fall to the lowest point. This simply makes the world easier to traverse. This is all the information necessary to see each of the artifacts yourself and you can walk through anything you want to see, although we have included key snapshots in our gradeable artifacts folder in the zip file in the first level of the folder.

GUI: In the GUI, we track the position of the user, so you can perfectly recreate our artifacts if you wish. Furthermore, we track FPS as a measure of performance as well as the amount of chunks loaded versus rendered to show how our culling is boosting performance and working effectively. Through the GUI, you can monitor each aspect of the program and gain deeper insights as you traverse the world and examine the shadows. The "R" key also works the same as a reset to the top of the world, which in especially laggy modes (shadow volume) can be used to quickly gain a bird's eye view of the shadows. 

The below references of "shadow mapping #1" or "ambient occlusion #1" refer to file names in the gradeable artifacts folder.

1. Shadow Mapping:
We have a couple of artifacts for this. Shadow Map #1 illustrates the effects of this method on a tree, resulting in soft shadows that mimic the tree with terrain shadows in the background. Shadow Map #2 is a birds eye view of a hill/cliff, in which you can see the shadows displayed as the sun hits it at an angle and is coming from the bottom left area and results in shadows being casted downward. Shadow map #3 further shows this as you can clearly see the shadow of the hill. 

2. Shadow Volume: 
Shadow volume #1 shows far more rigid shadows. This is due to building the extrusions on the cube, resulting in very cubic results as well. However, you see the same behavior of light creating shadows for hills and cliffs, just more cubic due to the nature of shadow volume building in our code. Shadow volume #2 further shows this result from another angle.

3. Ambient Occlusion:
For ambient occlusion, we wanted to show a non-shadow technique. Instead of rasterizing at building the chunks, we used a mathematical operation to shade the sides of blocks based on their ability to receive light. Thus areas that the light had difficulty reaching due to angles or covering were darker. For instance in ambient occlusion #1 you can see that some of the dirt block sides are extremely bright while others are very dark, showing how the angle the light is coming from affects the color of the block. Ambient occlusion #2 further shows this with the difference in two different angles of cobblestone.

4. Performance comparison:
We compared performance of these different methods through implementing a frame counter in the GUI in the top left. Referencing the frame count images, ie "Shadow Map Frame Count" and the other similar files, as you would expect based on methodology, ambient occlusion had the highest performance, with ~36 frames per second. Shadow mapping had the next highest with ~9 FPS, and shadow volume, the most computationally intensive had ~1 FPS. Even if we had implemented shadows for ambient occlusion by rasterizing at chunk building, it would have been precomputed, thus likely still a high number of frames, but shadow volume was definitely the worst performance but the cleanest and crispest shadows that adhered directly to the terrain and fit most perfectly to the shape of the sillhoutte. 

5. Smart Culling (Frustum + Occlusion):
Lastly, we also implemented smart culling through frustum and occlusion culling. Referencing frustum culling video, you can see me moving forward, and initially, while there are 13 chunks loaded, only 8 are rendered, indicating that frustum culling is doing its job and helping performance. As I move forward, the amount of chunks rendered goes down, as the camera no longer includes some chunks to the side, and there are less chunks in view, which now increases the FPS as performance increases even more, once again indicating that frustum culling is working as intended. However, as new chunks then load, the chunks rendered goes up and perforamnce comes back down, which is also intended behavior. Next, while swiveling around, you can see the number change depending on how many chunks are in view. The final test was to look into the sky and down, which would result in hardly any chunks in view, which accordingly results in only 1-2 chunks being rendered so I still can stand, but no more than necessary, resulting in maximum performance. Moving to Occlusion Demo, this shows that as I walk behind a wall, occlusion culling culls a chunk based on the fact that I can no longer see it, thus improving performance as well and is the intended behavior. 

Therefore, we implemented the entirety of the shadow option given as a final project scope in the example, but also added the additional technical contribution of smart culling. If you need anymore gradeable artifacts, please feel free to just run the program and see the world for yourself.

Thanks for a great class and all the help both the TA's and Dr. Vouga have provided through Discord and OH, it feels very well supported!

