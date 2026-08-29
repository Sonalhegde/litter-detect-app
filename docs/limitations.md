# Limitations

Sentinel is a single-class detector and therefore has limited marine-litter semantic coverage. It may produce false positives or false negatives, especially for small, occluded, distant, reflective, or visually ambiguous objects. Lighting, waves, sand, rocks, weather, camera quality, image compression, and shoreline composition can create environmental variation and domain shift.

CPU inference can be slow on larger inputs. Confidence thresholds trade recall against precision; lowering the threshold may surface more candidates while increasing false positives. Validation and test results must remain separate. A no-detection result is not a guarantee of marine-image relevance detection or absence of debris.

The project has not completed locked-test evaluation for the 852-image test split, and the interface does not claim comparison results for YOLO26n, m, l, or x.
