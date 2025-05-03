Surya Chokkar & Krystal An

Extra Credit: We both on our honor completed the course evaluation for the bonus point. 

Program Walkthrough:
We chose to implement the shadow option of the project. Therefore, we implemented shadow mapping, shadow volume, and ambient occlusion and were able to compare the performance of each method through measuring the amount of frames rendered. Additionally, we had another technical contribution, which is smart culling. We implemented frustum and occlusion culling, which helped reduce the strain of the shadows on performance, but also allowed us to add on to an already challenging project and add a second technical contribution. 

We have also included several gradeable artifacts in the zip folder under the file name "gradeable artifacts" that we will describe in further detail below. 

Before describing our findings, we want to quickly go over how to walk through the program when run. As soon as the code is run, the program begins in "normal", which has no shadows and is normal minecraft. The user can then toggle through each mode by pressing "T", which will change the mode and the change will be reflected in the top left corner, which keeps track of what mode the user is in at any given time. We also changed the walking mechanics similar to Minecraft's creative mode in which if the user walks off a mountain, they will fly, but if they wish to fall, they can hit the spacebar and they will jump and fall to the lowest point. This simply makes the world easier to traverse. This is all the information necessary to see each of the artifacts yourself.

GUI: In the GUI, we track the position of the user, so you can perfectly recreate our artifacts if you wish. Furthermore, we track FPS as a measure of performance as well as the amount of chunks loaded versus rendered to show how our culling is boosting performance and working effectively. Through the GUI, you can monitor each aspect of the program and gain deeper insights as you traverse the world and examine the shadows. The "R" key also works the same as a reset to the top of the world, which in especially laggy modes (shadow volume) can be used to quickly gain a bird's eye view of the shadows. 

