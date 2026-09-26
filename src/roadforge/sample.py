"""Connected sample city with intersections and multiple possible routes."""

from roadforge.world import Point, Road, World

DEFAULT_START = "0-0"
DEFAULT_GOAL = "4-3"


def sample_world() -> World:
    columns, rows = [110, 310, 515, 720, 920], [115, 300, 495, 690]
    nodes = {
        f"{x}-{y}": Point(float(columns[x] + (y % 2) * 8), float(rows[y] + (x % 2) * 6))
        for y in range(4)
        for x in range(5)
    }
    roads = []
    for y in range(4):
        for x in range(5):
            if x < 4:
                roads.append(Road(f"{x}-{y}", f"{x + 1}-{y}"))
            if y < 3:
                roads.append(Road(f"{x}-{y}", f"{x}-{y + 1}"))
    return World(nodes, roads)
