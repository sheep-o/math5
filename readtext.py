#!/usr/bin/env python3
# The first argument is the path to the image and the second one is the output folder
import cv2
import numpy as np
import time
from imutils.object_detection import non_max_suppression
import sys
import os


def east_detect(image):
    layerNames = ["feature_fusion/Conv_7/Sigmoid", "feature_fusion/concat_3"]

    orig = image.copy()

    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)

    (H, W) = image.shape[:2]

    # set the new width and height and then determine the ratio in change
    # for both the width and height: Should be multiple of 32
    (newW, newH) = (320, 320)

    rW = W / float(newW)
    rH = H / float(newH)

    # resize the image and grab the new image dimensions
    image = cv2.resize(image, (newW, newH))

    (H, W) = image.shape[:2]

    net = cv2.dnn.readNet("frozen_east_text_detection.pb")

    blob = cv2.dnn.blobFromImage(
        image, 1.0, (W, H), (123.68, 116.78, 103.94), swapRB=True, crop=False
    )

    start = time.time()

    net.setInput(blob)

    (scores, geometry) = net.forward(layerNames)

    (numRows, numCols) = scores.shape[2:4]
    rects = []
    confidences = []
    # loop over the number of rows
    for y in range(0, numRows):
        # extract the scores (probabilities), followed by the geometrical
        # data used to derive potential bounding box coordinates that
        # surround text
        scoresData = scores[0, 0, y]
        xData0 = geometry[0, 0, y]
        xData1 = geometry[0, 1, y]
        xData2 = geometry[0, 2, y]
        xData3 = geometry[0, 3, y]
        anglesData = geometry[0, 4, y]

        for x in range(0, numCols):
            # if our score does not have sufficient probability, ignore it
            # Set minimum confidence as required
            if scoresData[x] < 0.5:
                continue
            # compute the offset factor as our resulting feature maps will
            #  x smaller than the input image
            (offsetX, offsetY) = (x * 4.0, y * 4.0)
            # extract the rotation angle for the prediction and then
            # compute the sin and cosine
            angle = anglesData[x]
            cos = np.cos(angle)
            sin = np.sin(angle)
            # use the geometry volume to derive the width and height of
            # the bounding box
            heightBoost = 0.5
            widthBoost = 1 / 6
            h = xData0[x] + xData2[x] * (1 + heightBoost * 2)
            w = xData1[x] + xData3[x] * (1 + widthBoost * 2)
            # compute both the starting and ending (x, y)-coordinates for
            # the text prediction bounding box
            endX = int(offsetX + (cos * xData1[x]) + (sin * xData2[x])) + w * widthBoost
            if endX > W:
                h = h - (endX - W)
                endX = W - 1
            endY = (
                int(offsetY - (sin * xData1[x]) + (cos * xData2[x])) + h * heightBoost
            )
            if endY > H:
                h = h - (endY - H)
                endY = H - 1
            startX = int(endX - w) - w * widthBoost
            if startX < 0:
                w = w + startX
                startX = 0
            startY = int(endY - h) - h * heightBoost
            if startY < 0:
                h = h + startY
                startY = 0
            # add the bounding box coordinates and probability score to
            # our respective lists
            rects.append((startX, startY, endX, endY))
            confidences.append(scoresData[x])
    oldBoxes = non_max_suppression(np.array(rects), probs=confidences)
    boxes = []
    # Merges boxes that are too close to each other
    for (startX, startY, endX, endY) in oldBoxes:
        startX = int(startX * rW)
        startY = int(startY * rH)
        endX = int(endX * rW)
        endY = int(endY * rH)
        height = endY - startY
        while True:
            merged = False
            for (startX2, startY2, endX2, endY2) in boxes:
                # Checks if the boxes are close enough to each other
                if (
                    startY2 - endY < height / 2
                    and startY - endY2 < height / 2
                    and startX2 - endX < height
                    and startX - endX2 < height
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
    # for (startX, startY, endX, endY) in boxes:
    #     scale the bounding box coordinates based on the respective
    #     ratios
    #     draw the bounding box on the image
    #     cv2.rectangle(orig, (startX, startY), (endX, endY), (0, 255, 0), 5)
    for (startX, startY, endX, endY) in oldBoxes:
        # scale the bounding box coordinates based on the respective
        # ratios
        # draw the bounding box on the image
        startX = int(startX * rW)
        startY = int(startY * rH)
        endX = int(endX * rW)
        endY = int(endY * rH)
        images.append(orig[startY:endY, startX:endX])
        # cv2.rectangle(orig, (startX, startY), (endX, endY), (255, 0, 0), 2)
    print(time.time() - start)
    return images


frame = cv2.imread(sys.argv[1])
images = east_detect(frame)
try:
    os.system("rm -r " + str(sys.argv[2]))
except:
    1
os.mkdir(str(sys.argv[2]))
for x in range(len(images)):
    try:
        cv2.imwrite(str(sys.argv[2]) + "/img" + str(x) + ".jpg", images[x])
    except:
        1
