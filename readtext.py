#!/usr/bin/env python3
# The first argument is the path to the image and the second one is the output folder
import cv2
import time
import sys
import os

def east_detect(image):
    start = time.time()
    gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (0,0), sigmaX=50, sigmaY=50)
    # divide
    divide = cv2.divide(gray, blur, scale=255)
    oldBoxes = []
    thresh = cv2.threshold(divide,0,255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1]
    contours = cv2.findContours(thresh, 1, 2)[0]
    for cntr in contours:
        x,y,w,h = cv2.boundingRect(cntr)
        if w > len(image[0]) / 2 or h > len(image) / 2:
            continue
        if 15 > w and 15 > h:
            continue
        oldBoxes.append((x,y,x+w,y+h))
    boxes = []
    # Merges boxes that are too close to each other
    for (startX, startY, endX, endY) in oldBoxes:
        startX = int(startX)
        startY = int(startY)
        endX = int(endX)
        endY = int(endY)
        heightIncrease = (endY - startY) / 2.2
        widthIncrease = (endY - startY) * 1.4
        while True:
            merged = False
            for (startX2, startY2, endX2, endY2) in boxes:
                # Checks if the boxes are close enough to each other
                if (
                    startY2 - endY < heightIncrease
                    and startY - endY2 < heightIncrease
                    and startX2 - endX < widthIncrease
                    and startX - endX2 < widthIncrease
                ) or (
                    endY - startY2 < heightIncrease
                    and endY2 - startY < heightIncrease
                    and endX - startX2 < widthIncrease
                    and endX2 - startX < widthIncrease
                ):
                    # Merges the boxes
                    startX = min(startX, startX2)
                    startY = min(startY, startY2)
                    endX = max(endX, endX2)
                    endY = max(endY, endY2)
                    boxes.remove((startX2, startY2, endX2, endY2))
                    merged = True
                    break
            if not merged:
                break
        boxes.append((startX, startY, endX, endY))
    images = []
    # loop over the bounding boxes
    # for (startX, startY, endX, endY) in oldBoxes:
    #     scale the bounding box coordinates based on the respective
    #     ratios
        # draw the bounding box on the image
        # cv2.rectangle(image, (startX, startY), (endX, endY), (0, 255, 0), 5)
    for (startX, startY, endX, endY) in boxes:
        # scale the bounding box coordinates based on the respective
        # ratios
        # draw the bounding box on the image
        images.append(image[startY:endY, startX:endX])
        # cv2.rectangle(image, (startX, startY), (endX, endY), (255, 0, 0), 2)
    print(time.time() - start)
    return images


frame = cv2.imread(sys.argv[1])
images = east_detect(frame)
try:
    os.system("rm -r " + str(sys.argv[2]))
except:
    1
os.mkdir(str(sys.argv[2]))
print(len(images))
for x in range(len(images)):
    try:
        cv2.imwrite(str(sys.argv[2]) + "/img" + str(x) + ".jpg", images[x])
    except:
        1
